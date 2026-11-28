import fs from 'node:fs';
import { spawn } from 'node:child_process';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel as joinDiscordVoiceChannel,
} from '@discordjs/voice';
import prism from 'prism-media';
import {
  getPlayerState,
  setPlayerState,
  clearPlayerState,
} from './playerStore.js';
import {
  MUSIC_BUTTON_IDS,
  buildNowPlayingEmbed,
  buildQueueEmbed,
  buildMusicErrorEmbed,
  buildMusicInfoEmbed,
  buildPlayerButtonRows,
} from './musicEmbeds.js';

let loggedCookieStatus = false;

export function initializeMusic(client) {
  if (!client) return;
  if (!client.music) {
    client.music = {
      directMode: true,
      providers: ['youtube', 'spotify'],
    };
  }
  getCookiesFilePath();
}

function getCookiesFilePath() {
  const candidates = [
    process.env.YTDLP_COOKIES_PATH,
    '/usr/src/app/cookies.txt',
    './cookies.txt',
    'cookies.txt',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const size = fs.statSync(candidate).size;
        if (size > 0) {
          if (!loggedCookieStatus) {
            loggedCookieStatus = true;
            console.log(`[COOKIES] Loaded ${candidate} (${size} bytes)`);
          }
          return candidate;
        }
      }
    } catch {}
  }

  if (!loggedCookieStatus) {
    loggedCookieStatus = true;
    console.warn('[COOKIES] No non-empty cookies.txt found in expected paths.');
  }
  return null;
}

function buildCookieArgs() {
  const cookiePath = getCookiesFilePath();
  return cookiePath ? ['--cookies', cookiePath] : [];
}

function isUrl(value) {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractSpotifyTrackId(input) {
  const raw = String(input || '').trim();
  const uriMatch = raw.match(/^spotify:track:([A-Za-z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(raw);
    if (url.hostname.includes('spotify.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const trackIdx = parts.findIndex((p) => p === 'track');
      if (trackIdx !== -1 && parts[trackIdx + 1]) {
        return parts[trackIdx + 1].split('?')[0];
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchSpotifyTrackMetadata(trackId) {
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error('تعذر جلب بيانات مقطع سبوتيفاي.');
    }

    const html = await res.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      throw new Error('تعذر قراءة بيانات مقطع سبوتيفاي.');
    }

    const json = JSON.parse(nextDataMatch[1]);
    const track =
      json?.props?.pageProps?.state?.data?.entity ||
      json?.props?.pageProps?.state?.data?.trackUnion ||
      null;

    const title = track?.title || track?.name || '';
    const artists = Array.isArray(track?.artists)
      ? track.artists.map((a) => a.name).filter(Boolean)
      : Array.isArray(track?.artists?.items)
        ? track.artists.items.map((a) => a?.profile?.name).filter(Boolean)
        : [];

    const durationMs = Number(track?.duration?.totalMilliseconds ?? track?.duration_ms ?? 0);

    if (!title) {
      throw new Error('لم يتم العثور على اسم المقطع في رابط سبوتيفاي.');
    }

    return {
      title,
      artists,
      artistText: artists.join(', '),
      durationSec: durationMs > 0 ? Math.round(durationMs / 1000) : 0,
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Live / Unknown';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function parseSecondsInput(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value !== 'string') return NaN;
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Number(trimmed));
  }
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return NaN;
}

async function safeSendMusicPayload(target, payload) {
  if (!target) return null;

  const ctx = target.interaction || target;
  const editPayload = {
    content: payload.content ?? null,
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  };

  try {
    if (ctx.deferred || ctx.replied) {
      if (typeof ctx.editReply === 'function') {
        return await ctx.editReply(editPayload);
      }
      if (typeof ctx.followUp === 'function') {
        return await ctx.followUp(payload);
      }
    }

    if (typeof ctx.reply === 'function') {
      return await ctx.reply(payload);
    }

    if (typeof ctx.editReply === 'function') {
      return await ctx.editReply(editPayload);
    }

    if (ctx.channel && typeof ctx.channel.send === 'function') {
      return await ctx.channel.send({
        content: payload.content ?? null,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      });
    }
  } catch {
    if (ctx.channel && typeof ctx.channel.send === 'function') {
      return await ctx.channel.send({
        content: payload.content ?? null,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      }).catch(() => null);
    }
  }

  return null;
}

export function getPlayer(guildId) {
  return getPlayerState(guildId);
}

export function replyMusicSuccess(interaction, message, ephemeral = false) {
  const payload = {
    embeds: [buildMusicInfoEmbed(message)],
    ephemeral,
  };
  return safeSendMusicPayload(interaction, payload);
}

export function replyMusicError(interaction, message, ephemeral = true) {
  const payload = {
    embeds: [buildMusicErrorEmbed(message)],
    ephemeral,
  };
  return safeSendMusicPayload(interaction, payload);
}

export function buildNowPlayingReply(guildId) {
  const state = getPlayerState(guildId);
  if (!state?.currentTrack) {
    return {
      embeds: [buildMusicInfoEmbed('No track is currently playing.')],
      components: [],
    };
  }
  return {
    embeds: [buildNowPlayingEmbed(state.currentTrack, state)],
    components: buildPlayerButtonRows(state),
  };
}

export function buildQueueReply(guildId) {
  const state = getPlayerState(guildId);
  if (!state || (!state.currentTrack && (!Array.isArray(state.queue) || state.queue.length === 0))) {
    return {
      embeds: [buildMusicInfoEmbed('The queue is currently empty.')],
      components: [],
    };
  }
  return {
    embeds: [buildQueueEmbed(state)],
    components: buildPlayerButtonRows(state),
  };
}

export async function handleQueue(interaction) {
  const ctx = interaction?.interaction || interaction;
  const guildId = ctx?.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const payload = buildQueueReply(guildId);
  await safeSendMusicPayload(ctx, payload);
}

export function applyPause(guildId) {
  const state = getPlayerState(guildId);
  if (!state?.player) return false;
  if (state.player.state.status === AudioPlayerStatus.Playing) {
    return state.player.pause();
  }
  return false;
}

export function applyResume(guildId) {
  const state = getPlayerState(guildId);
  if (!state?.player) return false;
  if (state.player.state.status === AudioPlayerStatus.Paused) {
    return state.player.unpause();
  }
  return false;
}

export function pausePlayback(guildIdOrInteraction) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const state = getPlayerState(guildId);
  if (!state?.player) return false;

  if (state.player.state.status === AudioPlayerStatus.Playing) {
    state.isPlaying = false;
    setPlayerState(guildId, state);
    return state.player.pause();
  }

  return false;
}

export function resumePlayback(guildIdOrInteraction) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const state = getPlayerState(guildId);
  if (!state?.player) return false;

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    state.isPlaying = true;
    setPlayerState(guildId, state);
    return state.player.unpause();
  }

  return false;
}

export function seekTrack(guildIdOrInteraction, positionInput) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const state = getPlayerState(guildId);
  if (!state?.currentTrack) return false;

  const seconds = parseSecondsInput(positionInput);
  if (!Number.isFinite(seconds) || seconds < 0) return false;

  const maxSec = Number(state.currentTrack.durationSec || 0);
  const clampedSec = maxSec > 0 ? Math.min(seconds, Math.max(0, maxSec - 1)) : seconds;

  state.seekSeconds = clampedSec;
  setPlayerState(guildId, state);

  const connection = getVoiceConnection(guildId);
  if (connection) {
    startTrackPlayback(guildId, state.currentTrack, connection, clampedSec);
  }

  return clampedSec;
}

export function setVolume(guildIdOrInteraction, volumeInput) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const numericVolume = Number(volumeInput);
  if (!Number.isFinite(numericVolume)) return false;

  const clampedVolume = Math.max(0, Math.min(200, Math.round(numericVolume)));
  const state = getPlayerState(guildId) || {
    guildId,
    queue: [],
    currentTrack: null,
    isPlaying: false,
    volume: 100,
    seekSeconds: 0,
    loop: false,
    twentyFourSeven: false,
  };

  state.volume = clampedVolume;

  const resource = state.player?.state?.resource;
  if (resource?.volume && typeof resource.volume.setVolume === 'function') {
    resource.volume.setVolume(Math.max(0, Math.min(2, clampedVolume / 100)));
  }

  setPlayerState(guildId, state);
  return clampedVolume;
}

export function setLoopMode(guildIdOrInteraction, modeOrToggle) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const state = getPlayerState(guildId);
  if (!state) return false;

  if (typeof modeOrToggle === 'boolean') {
    state.loop = modeOrToggle;
  } else if (typeof modeOrToggle === 'string') {
    const normalized = modeOrToggle.toLowerCase();
    if (normalized === 'off' || normalized === 'none') {
      state.loop = false;
    } else if (normalized === 'track' || normalized === 'song' || normalized === 'on') {
      state.loop = true;
    } else {
      state.loop = !state.loop;
    }
  } else {
    state.loop = !state.loop;
  }

  setPlayerState(guildId, state);
  return state.loop;
}

export function setTwentyFourSeven(guildIdOrInteraction, enabledOrToggle) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;
  const state = getPlayerState(guildId) || {
    guildId,
    queue: [],
    currentTrack: null,
    isPlaying: false,
    volume: 100,
    seekSeconds: 0,
    loop: false,
    twentyFourSeven: false,
  };

  if (typeof enabledOrToggle === 'boolean') {
    state.twentyFourSeven = enabledOrToggle;
  } else if (typeof enabledOrToggle === 'string') {
    const normalized = enabledOrToggle.toLowerCase();
    if (normalized === 'off' || normalized === 'false' || normalized === 'disable') {
      state.twentyFourSeven = false;
    } else if (normalized === 'on' || normalized === 'true' || normalized === 'enable') {
      state.twentyFourSeven = true;
    } else {
      state.twentyFourSeven = !state.twentyFourSeven;
    }
  } else {
    state.twentyFourSeven = !state.twentyFourSeven;
  }

  setPlayerState(guildId, state);
  return state.twentyFourSeven;
}

export function clearQueue(guildId) {
  const state = getPlayerState(guildId);
  if (!state) return false;
  state.queue = [];
  setPlayerState(guildId, state);
  return true;
}

export function removeFromQueue(guildId, positionOrIndex) {
  const state = getPlayerState(guildId);
  if (!state || !Array.isArray(state.queue)) return null;

  const index = Number(positionOrIndex) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
    return null;
  }

  const [removed] = state.queue.splice(index, 1);
  setPlayerState(guildId, state);
  return removed;
}

export function moveInQueue(guildId, fromIndex, toIndex) {
  const state = getPlayerState(guildId);
  if (!state || !Array.isArray(state.queue)) return false;

  const from = Number(fromIndex) - 1;
  const to = Number(toIndex) - 1;

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= state.queue.length ||
    to < 0 ||
    to >= state.queue.length
  ) {
    return false;
  }

  const [movedItem] = state.queue.splice(from, 1);
  state.queue.splice(to, 0, movedItem);
  setPlayerState(guildId, state);
  return movedItem;
}

export function destroyPlayerSession(guildIdOrInteraction) {
  const guildId = typeof guildIdOrInteraction === 'string'
    ? guildIdOrInteraction
    : guildIdOrInteraction?.guild?.id;

  if (!guildId) return false;

  const state = getPlayerState(guildId);
  if (state && typeof state.cleanupStream === 'function') {
    try {
      state.cleanupStream();
    } catch {}
  }

  if (state?.player) {
    try {
      state.player.stop(true);
    } catch {}
  }

  try {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
    }
  } catch {}

  clearPlayerState(guildId);
  return true;
}

function runYtDlpJson(input, extraArgs = [], limit = 1) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--skip-download',
      ...buildCookieArgs(),
      ...extraArgs,
      input,
    ];

    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error('انتهت مهلة البحث عن المقطع.'));
    }, 12000);

    const done = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    };

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      done(reject, new Error(`yt-dlp binary error: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const cleanStderr = stderr.trim();
        if (cleanStderr.includes('[DRM]')) {
          done(
            reject,
            new Error('هذا الرابط محمي بحماية DRM ولا يمكن تشغيله مباشرة. استخدم اسم المقطع أو رابطاً عاماً غير محمي.')
          );
          return;
        }
        if (cleanStderr.includes("Sign in to confirm you’re not a bot") || cleanStderr.includes("Sign in to confirm you're not a bot")) {
          done(
            reject,
            new Error('يوتيوب يطلب تأكيد الهوية (Bot Check). تأكد من وجود ملف cookies.txt سليم أو جدّد الكوكيز.')
          );
          return;
        }
        done(reject, new Error(cleanStderr || `yt-dlp exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const rawEntries = Array.isArray(parsed.entries) && parsed.entries.length > 0
          ? parsed.entries.slice(0, limit)
          : [parsed];

        const entries = rawEntries
          .filter((entry) => entry && (entry.webpage_url || entry.url || entry.id))
          .map((entry) => {
            const sourceUrl =
              entry.webpage_url ||
              (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : entry.url);

            return {
              title: entry.title || 'Audio Track',
              url: sourceUrl,
              streamTarget: entry.url || sourceUrl,
              durationSec: Number(entry.duration || 0),
              thumbnail: entry.thumbnail || null,
              author: entry.uploader || entry.channel || 'Unknown',
            };
          });

        if (!entries.length) {
          done(reject, new Error('Empty metadata returned by yt-dlp'));
          return;
        }

        done(resolve, entries);
      } catch (err) {
        done(reject, new Error(`Metadata JSON parse error: ${err.message}`));
      }
    });
  });
}

function pickBestSpotifyMatch(candidates, expectedTitle, expectedDurationSec) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const normalizedTitle = String(expectedTitle || '').toLowerCase();

  const scored = candidates.map((item) => {
    let score = 0;
    const itemTitle = String(item.title || '').toLowerCase();

    if (normalizedTitle && itemTitle.includes(normalizedTitle)) {
      score += 30;
    }

    if (expectedDurationSec > 0 && item.durationSec > 0) {
      const diff = Math.abs(item.durationSec - expectedDurationSec);
      if (diff <= 3) score += 40;
      else if (diff <= 10) score += 25;
      else if (diff > 30) score -= 20;
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].item;
}

export async function resolveTrack(query, requestedBy) {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) {
    throw new Error('من فضلك أدخل اسم الأغنية أو رابط يوتيوب أو سبوتيفاي.');
  }

  const spotifyTrackId = extractSpotifyTrackId(rawQuery);
  let input = rawQuery;
  let sourceType = 'youtube';
  let expectedMeta = null;

  if (spotifyTrackId) {
    sourceType = 'spotify';
    expectedMeta = await fetchSpotifyTrackMetadata(spotifyTrackId);
    const searchQuery = expectedMeta.artistText
      ? `${expectedMeta.title} ${expectedMeta.artistText}`
      : expectedMeta.title;
    input = `ytsearch3:${searchQuery}`;
  } else if (isUrl(rawQuery)) {
    input = rawQuery;
  } else {
    input = `ytsearch1:${rawQuery}`;
  }

  const attempts = [
    ['--remote-components', 'ejs:github'],
    ['--remote-components', 'ejs:github', '--extractor-args', 'youtube:player_client=mweb,web'],
    ['--extractor-args', 'youtube:player_client=tv_embedded'],
    [],
  ];

  let lastError = null;

  for (const args of attempts) {
    try {
      const limit = sourceType === 'spotify' ? 3 : 1;
      const entries = await runYtDlpJson(input, args, limit);
      const chosen = sourceType === 'spotify'
        ? pickBestSpotifyMatch(entries, expectedMeta?.title, expectedMeta?.durationSec)
        : entries[0];

      if (!chosen) {
        throw new Error('لم يتم العثور على مقطع مطابق.');
      }

      return {
        ...chosen,
        title: expectedMeta?.title || chosen.title,
        author: expectedMeta?.artistText || chosen.author,
        durationSec: expectedMeta?.durationSec || chosen.durationSec,
        duration: formatDuration(expectedMeta?.durationSec || chosen.durationSec),
        displayUrl: expectedMeta?.spotifyUrl || chosen.url,
        source: sourceType,
        requestedBy,
      };
    } catch (err) {
      lastError = err;
    }
  }

  console.error('[RESOLVE TRACK FAILED]:', lastError?.message || lastError);
  throw new Error(lastError?.message || 'تعذر تجهيز المقطع المطلوب.');
}

function createAudioStreamFromTrack(track, seekSec = 0) {
  const target = track.url || track.streamTarget;

  const ytdlp = spawn(
    'yt-dlp',
    [
      '-o',
      '-',
      '-q',
      '--no-playlist',
      '--no-warnings',
      '--buffer-size',
      '16K',
      '--remote-components',
      'ejs:github',
      ...buildCookieArgs(),
      target,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const ffmpegArgs = [
    '-analyzeduration',
    '0',
    '-probesize',
    '32768',
    '-loglevel',
    '0',
    ...(seekSec > 0 ? ['-ss', String(seekSec)] : []),
    '-i',
    'pipe:0',
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    'pipe:1',
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.error('[YT-DLP STREAM]:', msg);
  });

  ffmpeg.stderr.on('data', () => {});

  ytdlp.on('error', () => {
    try {
      ffmpeg.kill('SIGKILL');
    } catch {}
  });

  ffmpeg.on('error', () => {
    try {
      ffmpeg.kill('SIGKILL');
    } catch {}
  });

  const opusEncoder = new prism.opus.Encoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });

  const opusStream = ffmpeg.stdout.pipe(opusEncoder);

  const resource = createAudioResource(opusStream, {
    inputType: 'opus',
    inlineVolume: true,
  });

  return {
    resource,
    cleanup: () => {
      try {
        ytdlp.stdout.unpipe(ffmpeg.stdin);
      } catch {}
      try {
        ffmpeg.stdout.unpipe(opusEncoder);
      } catch {}
      try {
        opusStream.destroy();
      } catch {}
      try {
        opusEncoder.destroy();
      } catch {}
      try {
        ffmpeg.kill('SIGKILL');
      } catch {}
      try {
        ytdlp.kill('SIGKILL');
      } catch {}
    },
  };
}

function attachVoiceConnectionListeners(connection, guild, voiceChannelId) {
  if (!connection || connection.__musicListenersAttached) return;
  connection.__musicListenersAttached = true;

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[VOICE STATE] ${guild.id}: ${oldState.status} -> ${newState.status}`);
  });

  connection.on('error', (err) => {
    console.error('[VOICE CONNECTION ERROR]:', err?.message || err);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      try {
        connection.destroy();
      } catch {}

      const state = getPlayerState(guild.id);
      if (state?.twentyFourSeven || state?.currentTrack) {
        try {
          const rejoined = joinDiscordVoiceChannel({
            channelId: voiceChannelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
          });
          attachVoiceConnectionListeners(rejoined, guild, voiceChannelId);
          await entersState(rejoined, VoiceConnectionStatus.Ready, 25000);
          if (state.player) {
            rejoined.subscribe(state.player);
          }
        } catch (err) {
          console.error('[VOICE REJOIN FAILED]:', err?.message || err);
        }
      }
    }
  });
}

export async function ensureVoiceConnection(interaction, voiceChannel) {
  const ctx = interaction?.interaction || interaction;
  const guild = ctx.guild;
  if (!guild) {
    throw new Error('لا يمكن تحديد السيرفر.');
  }

  let connection = getVoiceConnection(guild.id);

  if (connection && connection.joinConfig?.channelId !== voiceChannel.id) {
    try {
      connection.destroy();
    } catch {}
    connection = null;
  }

  if (!connection) {
    connection = joinDiscordVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
  }

  attachVoiceConnectionListeners(connection, guild, voiceChannel.id);

  if (connection.state.status !== VoiceConnectionStatus.Ready) {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 25000);
    } catch (err) {
      console.error(
        '[VOICE READY TIMEOUT]: status =',
        connection.state.status,
        'reason =',
        err?.message || err
      );
      connection.destroy();
      throw new Error(
        'تعذر الاتصال بالروم الصوتي في الوقت المحدد. تأكد من صلاحيات البوت في الروم الصوتي وتثبيت مكتبات التشفير الصوتي (sodium-native / libsodium-wrappers).'
      );
    }
  }

  return connection;
}

export async function joinVoiceChannel(interaction, voiceChannel) {
  const ctx = interaction?.interaction || interaction;
  const targetChannel = voiceChannel || ctx?.member?.voice?.channel;
  if (!targetChannel) {
    await replyMusicError(ctx, 'يجب أن تكون متواجداً داخل روم صوتي أولاً.', true);
    return null;
  }

  const connection = await ensureVoiceConnection(ctx, targetChannel);
  await replyMusicSuccess(ctx, `تم الانضمام إلى <#${targetChannel.id}>.`, false);
  return connection;
}

function advanceQueueOrIdle(guildId, player) {
  const currentState = getPlayerState(guildId);
  if (!currentState) return;

  if (typeof currentState.cleanupStream === 'function') {
    try {
      currentState.cleanupStream();
    } catch {}
    currentState.cleanupStream = null;
  }

  if (currentState.loop && currentState.currentTrack) {
    const activeConn = getVoiceConnection(guildId);
    if (activeConn) {
      startTrackPlayback(guildId, currentState.currentTrack, activeConn, 0);
    }
    return;
  }

  const nextTrack = Array.isArray(currentState.queue) ? currentState.queue.shift() : null;
  if (nextTrack) {
    const activeConn = getVoiceConnection(guildId);
    if (activeConn) {
      startTrackPlayback(guildId, nextTrack, activeConn, 0);
      return;
    }
  }

  currentState.currentTrack = null;
  currentState.seekSeconds = 0;
  currentState.isPlaying = false;
  setPlayerState(guildId, currentState);

  if (!currentState.twentyFourSeven && player) {
    try {
      player.stop();
    } catch {}
  }
}

function startTrackPlayback(guildId, track, connection, seekSec = 0) {
  let state = getPlayerState(guildId) || {
    guildId,
    queue: [],
    currentTrack: null,
    isPlaying: false,
    volume: 100,
    seekSeconds: 0,
    loop: false,
    twentyFourSeven: false,
    player: null,
    cleanupStream: null,
  };

  if (typeof state.cleanupStream === 'function') {
    try {
      state.cleanupStream();
    } catch {}
  }

  let player = state.player;
  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    player.on(AudioPlayerStatus.Idle, () => {
      advanceQueueOrIdle(guildId, player);
    });

    player.on('error', (err) => {
      console.error('[AUDIO PLAYER ERROR]:', err?.message || err);
      advanceQueueOrIdle(guildId, player);
    });
  }

  connection.subscribe(player);

  const { resource, cleanup } = createAudioStreamFromTrack(track, seekSec);
  if (resource.volume && typeof resource.volume.setVolume === 'function') {
    resource.volume.setVolume(Math.max(0, Math.min(2, (state.volume ?? 100) / 100)));
  }

  state = {
    ...state,
    guildId,
    currentTrack: track,
    seekSeconds: seekSec,
    isPlaying: true,
    player,
    cleanupStream: cleanup,
  };

  setPlayerState(guildId, state);
  player.play(resource);
  return state;
}

export async function handlePlay(interaction, query) {
  const ctx = interaction?.interaction || interaction;
  const member = ctx.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await replyMusicError(ctx, 'يجب أن تكون متواجداً داخل روم صوتي أولاً.', true);
    return;
  }

  const guildId = ctx.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const track = await resolveTrack(query, ctx.user?.tag || ctx.user?.username || 'User');
  const connection = await ensureVoiceConnection(ctx, voiceChannel);

  const existingState = getPlayerState(guildId);
  const alreadyPlaying = Boolean(
    existingState?.currentTrack &&
    existingState?.player &&
    existingState.player.state.status !== AudioPlayerStatus.Idle
  );

  if (alreadyPlaying) {
    existingState.queue = Array.isArray(existingState.queue) ? existingState.queue : [];
    existingState.queue.push(track);
    setPlayerState(guildId, existingState);

    await safeSendMusicPayload(ctx, {
      embeds: [buildMusicInfoEmbed(`تمت إضافة **${track.title}** إلى قائمة الانتظار.`)],
      components: buildPlayerButtonRows(existingState),
    });
    return;
  }

  const updatedState = startTrackPlayback(guildId, track, connection, 0);

  await safeSendMusicPayload(ctx, {
    embeds: [buildNowPlayingEmbed(track, updatedState)],
    components: buildPlayerButtonRows(updatedState),
  });
}

export async function handleSkip(interaction) {
  const ctx = interaction?.interaction || interaction;
  const guildId = ctx?.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const state = getPlayerState(guildId);
  if (!state?.player || !state?.currentTrack) {
    await replyMusicError(ctx, 'لا يوجد مقطع قيد التشغيل حالياً لتخطيه.', true);
    return;
  }

  const nextTrack = Array.isArray(state.queue) && state.queue.length > 0 ? state.queue[0] : null;
  state.player.stop();

  await safeSendMusicPayload(ctx, {
    embeds: [
      buildMusicInfoEmbed(
        nextTrack
          ? `⏭️ تم التخطي. جارٍ تشغيل **${nextTrack.title}**...`
          : '⏭️ تم تخطي المقطع الحالي.'
      ),
    ],
  });
}

export async function handleTogglePause(interaction) {
  const ctx = interaction?.interaction || interaction;
  const guildId = ctx?.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const state = getPlayerState(guildId);
  if (!state?.player || !state?.currentTrack) {
    await replyMusicError(ctx, 'لا يوجد مقطع نشط حالياً.', true);
    return;
  }

  const status = state.player.state.status;
  if (status === AudioPlayerStatus.Playing) {
    pausePlayback(guildId);
    await safeSendMusicPayload(ctx, {
      embeds: [buildMusicInfoEmbed('⏸️ تم إيقاف التشغيل مؤقتاً.')],
      components: buildPlayerButtonRows(getPlayerState(guildId)),
    });
    return;
  }

  if (status === AudioPlayerStatus.Paused) {
    resumePlayback(guildId);
    await safeSendMusicPayload(ctx, {
      embeds: [buildMusicInfoEmbed('▶️ تم استئناف التشغيل.')],
      components: buildPlayerButtonRows(getPlayerState(guildId)),
    });
    return;
  }

  await replyMusicError(ctx, 'حالة المشغل لا تسمح بالتبديل حالياً.', true);
}

export async function handleLoopToggle(interaction) {
  const ctx = interaction?.interaction || interaction;
  const guildId = ctx?.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const state = getPlayerState(guildId);
  if (!state) {
    await replyMusicError(ctx, 'لا يوجد مشغل نشط في هذا السيرفر.', true);
    return;
  }

  const enabled = setLoopMode(guildId);
  await safeSendMusicPayload(ctx, {
    embeds: [buildMusicInfoEmbed(enabled ? '🔁 تم تفعيل التكرار (Loop: On).' : '➡️ تم إيقاف التكرار (Loop: Off).')],
    components: buildPlayerButtonRows(getPlayerState(guildId)),
  });
}

export async function handleStop(interaction) {
  const ctx = interaction?.interaction || interaction;
  const guildId = ctx?.guild?.id;
  if (!guildId) {
    await replyMusicError(ctx, 'هذا الأمر يعمل داخل السيرفرات فقط.', true);
    return;
  }

  const state = getPlayerState(guildId);
  if (!state) {
    await replyMusicError(ctx, 'المشغل متوقف بالفعل.', true);
    return;
  }

  if (state.twentyFourSeven) {
    clearQueue(guildId);
    if (typeof state.cleanupStream === 'function') {
      try {
        state.cleanupStream();
      } catch {}
      state.cleanupStream = null;
    }
    state.currentTrack = null;
    state.isPlaying = false;
    setPlayerState(guildId, state);
    if (state.player) {
      try {
        state.player.stop(true);
      } catch {}
    }
    await safeSendMusicPayload(ctx, {
      embeds: [buildMusicInfoEmbed('⏹️ تم إيقاف المقطع وتفريغ الطابور مع بقاء وضع 24/7 مفعلاً.')],
    });
    return;
  }

  destroyPlayerSession(guildId);
  await safeSendMusicPayload(ctx, {
    embeds: [buildMusicInfoEmbed('⏹️ تم إيقاف التشغيل ومغادرة الروم الصوتي.')],
  });
}

export async function handleMusicComponent(interaction) {
  const customId = interaction?.customId;
  if (!customId) return false;

  switch (customId) {
    case MUSIC_BUTTON_IDS.TOGGLE_PAUSE:
      await handleTogglePause(interaction);
      return true;
    case MUSIC_BUTTON_IDS.PAUSE:
      pausePlayback(interaction?.guild?.id);
      await safeSendMusicPayload(interaction, {
        embeds: [buildMusicInfoEmbed('⏸️ تم إيقاف التشغيل مؤقتاً.')],
        components: buildPlayerButtonRows(getPlayerState(interaction?.guild?.id)),
      });
      return true;
    case MUSIC_BUTTON_IDS.RESUME:
      resumePlayback(interaction?.guild?.id);
      await safeSendMusicPayload(interaction, {
        embeds: [buildMusicInfoEmbed('▶️ تم استئناف التشغيل.')],
        components: buildPlayerButtonRows(getPlayerState(interaction?.guild?.id)),
      });
      return true;
    case MUSIC_BUTTON_IDS.SKIP:
      await handleSkip(interaction);
      return true;
    case MUSIC_BUTTON_IDS.LOOP:
      await handleLoopToggle(interaction);
      return true;
    case MUSIC_BUTTON_IDS.STOP:
      await handleStop(interaction);
      return true;
    case MUSIC_BUTTON_IDS.QUEUE:
      await handleQueue(interaction);
      return true;
    default:
      return false;
  }
}
