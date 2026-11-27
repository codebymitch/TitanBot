import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import {
  joinVoiceChannel as discordJoinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} from '@discordjs/voice';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';

const execFileAsync = promisify(execFile);

// إصلاح: إزالة \ قبل $ ليطابق نهاية الرابط بشكل صحيح
const URL_PATTERN = /^https?:\/\/\S+$/i;
const SPOTIFY_TRACK_PATTERN = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/i;
const DIRECT_AUDIO_PATTERN = /\.(mp3|ogg|wav|m4a|flac|aac|opus)(\?.*)?$/i;
const VOICE_CONNECT_TIMEOUT_MS = 15_000;

const directSessions = new Map();

function toNodeStream(body) {
  if (!body) return null;
  if (typeof body.pipe === 'function') return body;
  if (typeof Readable.fromWeb === 'function') {
    return Readable.fromWeb(body);
  }
  return null;
}

function createDirectTrack(rawTrack, requester) {
  const info = rawTrack?.info ?? rawTrack ?? {};
  const title = info.title || 'مقطع صوتي';
  const author = info.author || 'مصدر مباشر';
  const uri = info.uri || info.url || '';
  const length = Number(info.length) || 0;
  const isStream = Boolean(info.isStream);

  return {
    title,
    author,
    uri,
    length,
    isStream,
    requester,
    info: {
      title,
      author,
      uri,
      length,
      isStream,
      isSeekable: false,
      requester,
    },
  };
}

// استخراج عنوان الأغنية من صفحة Spotify العامة بدون وسيط خارجي
async function resolveSpotifyUrlToSearchQuery(spotifyUrl) {
  const match = spotifyUrl.match(SPOTIFY_TRACK_PATTERN);
  if (!match) return spotifyUrl;

  try {
    const res = await fetch(spotifyUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const html = await res.text();
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch?.[1]) {
        const cleaned = titleMatch[1]
          .replace(/\s*-\s*song and lyrics by\s*/i, ' - ')
          .replace(/\s*\|\s*Spotify\s*$/i, '')
          .replace(/&amp;/g, '&')
          .trim();
        if (cleaned) return cleaned;
      }
    }
  } catch {
    // الرجوع إلى المعرّف عند تعذر جلب العنوان
  }

  return `spotify track ${match[1]}`;
}

// جلب بيانات المقطع أو البحث عبر yt-dlp مباشرة من الجهاز
async function extractWithYtDlp(searchOrUrl) {
  const target = URL_PATTERN.test(searchOrUrl) ? searchOrUrl : `ytsearch1:${searchOrUrl}`;
  const { stdout } = await execFileAsync(
    'yt-dlp',
    [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bestaudio/best',
      target,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const parsed = JSON.parse(stdout);
  const entry = Array.isArray(parsed?.entries) && parsed.entries.length > 0
    ? parsed.entries[0]
    : parsed;

  if (!entry) {
    throw new Error('No audio entry returned by yt-dlp');
  }

  return {
    title: entry.title || searchOrUrl,
    author: entry.uploader || entry.channel || 'YouTube',
    uri: entry.webpage_url || entry.url || searchOrUrl,
    streamUrl: entry.url || null,
    length: (Number(entry.duration) || 0) * 1000,
    isStream: Boolean(entry.is_live),
  };
}

async function resolveAudioSource(rawQuery, requester) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    throw new TitanBotError(
      'Empty query',
      ErrorTypes.USER_INPUT,
      'يرجى إدخال اسم الأغنية أو رابط من YouTube أو Spotify أو رابط صوتي مباشر.',
    );
  }

  // 1. رابط صوتي مباشر (.mp3, .ogg, ...)
  if (URL_PATTERN.test(query) && DIRECT_AUDIO_PATTERN.test(query)) {
    const cleanName = decodeURIComponent(query.split('/').pop()?.split('?')[0] || 'مقطع صوتي مباشر');
    return [
      createDirectTrack(
        {
          title: cleanName,
          author: 'رابط صوتي مباشر',
          uri: query,
          streamUrl: query,
          isStream: true,
        },
        requester,
      ),
    ];
  }

  // 2. رابط Spotify -> تحويله لنص بحث ثم جلبه عبر yt-dlp
  let effectiveQuery = query;
  if (URL_PATTERN.test(query) && SPOTIFY_TRACK_PATTERN.test(query)) {
    effectiveQuery = await resolveSpotifyUrlToSearchQuery(query);
  }

  // 3. رابط YouTube أو بحث بالاسم عبر yt-dlp مباشرة
  try {
    const info = await extractWithYtDlp(effectiveQuery);
    return [
      createDirectTrack(
        {
          title: info.title,
          author: info.author,
          uri: info.uri,
          streamUrl: info.streamUrl,
          length: info.length,
          isStream: info.isStream,
        },
        requester,
      ),
    ];
  } catch (err) {
    throw new TitanBotError(
      'Resolve failed',
      ErrorTypes.USER_INPUT,
      `تعذر العثور على المقطع أو تجهيزه: ${err?.message || 'خطأ غير معروف'}`,
    );
  }
}

function createFfmpegStream(inputUrl) {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', inputUrl,
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return ffmpeg.stdout;
}

async function buildTrackAudioResource(track, volume = 100) {
  let mediaUrl = track.streamUrl || track.uri;

  if (!mediaUrl || !URL_PATTERN.test(mediaUrl)) {
    const fresh = await extractWithYtDlp(track.uri || track.title);
    mediaUrl = fresh.streamUrl;
  }

  if (!mediaUrl) {
    throw new TitanBotError('Invalid stream', ErrorTypes.USER_INPUT, 'تعذر الحصول على رابط البث الصوتي.');
  }

  const pcmStream = createFfmpegStream(mediaUrl);
  if (!pcmStream) {
    throw new TitanBotError('FFmpeg failed', ErrorTypes.USER_INPUT, 'تعذر تشغيل FFmpeg لتحويل الصوت.');
  }

  const resource = createAudioResource(pcmStream, {
    inlineVolume: true,
  });

  if (resource.volume) {
    resource.volume.setVolume(Math.max(0, Math.min(1, volume / 100)));
  }

  return resource;
}
