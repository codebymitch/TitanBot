import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
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
import {
  buildNowPlayingEmbed,
  buildQueueEmbed,
  buildQueuePaginationRow,
  getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const execFileAsync = promisify(execFile);

const URL_PATTERN = /^https?:\/\/\S+$/i;
const SPOTIFY_TRACK_PATTERN = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/i;
const DIRECT_AUDIO_PATTERN = /\.(mp3|ogg|wav|m4a|flac|aac|opus)(\?.*)?$/i;
const VOICE_CONNECT_TIMEOUT_MS = 15_000;

const directSessions = new Map();

function resolveBinary(name) {
  const localCandidates = [
    join(process.cwd(), 'bin', name),
    join(process.cwd(), 'bin', `${name}.exe`),
  ];
  for (const candidate of localCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

const YTDLP_BIN = resolveBinary('yt-dlp');
const FFMPEG_BIN = resolveBinary('ffmpeg');

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
  const streamUrl = info.streamUrl || uri;
  const length = Number(info.length) || 0;
  const isStream = Boolean(info.isStream);

  return {
    title,
    author,
    uri,
    streamUrl,
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

function destroyPlayerSession(client, guildId, session, guildData) {
  if (guildData?.idleTimeout) {
    clearTimeout(guildData.idleTimeout);
    guildData.idleTimeout = null;
  }
  if (guildData) {
    clearUpdateInterval(guildData);
  }
  if (session && typeof session.destroy === 'function') {
    session.destroy();
  }
  directSessions.delete(guildId);
  return refreshPlayerMessage(client, guildId).catch(() => {});
}

function getDirectSession(client, guildId) {
  const guildData = getGuildMusicData(guildId);

  if (!directSessions.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    const queueItems = [];
    const queueObj = {
      get length() {
        return queueItems.length;
      },
      [Symbol.iterator]() {
        return queueItems[Symbol.iterator]();
      },
      some(fn) {
        return queueItems.some(fn);
      },
      slice(...args) {
        return queueItems.slice(...args);
      },
      add(track) {
        queueItems.push(track);
      },
      remove(index) {
        if (index >= 0 && index < queueItems.length) {
          return queueItems.splice(index, 1)[0];
        }
        return null;
      },
      splice(start, deleteCount, ...items) {
        return queueItems.splice(start, deleteCount, ...items);
      },
      clear() {
        queueItems.length = 0;
      },
      shuffle() {
        for (let i = queueItems.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [queueItems[i], queueItems[j]] = [queueItems[j], queueItems[i]];
        }
      },
    };

    const session = {
      guildId,
      voiceChannel: null,
      textChannel: null,
      connection: null,
      player,
      queue: queueObj,
      _items: queueItems,
      current: null,
      paused: false,
      playing: false,
      connected: false,
      loop: guildData.loop || 'none',
      volume: guildData.volume ?? 100,
      currentResource: null,
      skipCurrentLoop: false,
    };

    player.on(AudioPlayerStatus.Playing, () => {
      session.playing = true;
      session.paused = false;
      refreshPlayerMessage(client, guildId).catch(() => {});
    });

    player.on(AudioPlayerStatus.Paused, () => {
      session.paused = true;
      refreshPlayerMessage(client, guildId).catch(() => {});
    });

    player.on(AudioPlayerStatus.Idle, async () => {
      const finished = session.current;
      session.current = null;
      session.currentResource = null;
      session.playing = false;
      session.paused = false;

      if (finished && !session.skipCurrentLoop) {
        if (session.loop === 'track') {
          session._items.unshift(finished);
        } else if (session.loop === 'queue') {
          session._items.push(finished);
        }
      }
      session.skipCurrentLoop = false;

      if (session._items.length > 0) {
        try {
          await playNextInSession(session);
        } catch {
          // في حال فشل تشغيل المقطع التالي
        }
      } else {
        const latestGuildData = getGuildMusicData(guildId);
        if (!latestGuildData.twentyFourSeven) {
          latestGuildData.idleTimeout = setTimeout(() => {
            const currentSession = getPlayer(client, guildId);
            if (currentSession && !currentSession.current && currentSession.queue.length === 0) {
              destroyPlayerSession(client, guildId, currentSession, latestGuildData).catch(() => {});
            }
          }, 30_000);
        }
        refreshPlayerMessage(client, guildId).catch(() => {});
      }
    });

    player.on('error', () => {
      session.current = null;
      session.currentResource = null;
      session.playing = false;
      if (session._items.length > 0) {
        playNextInSession(session).catch(() => {});
      }
    });

    session.setVolume = (vol) => {
      session.volume = Math.max(0, Math.min(100, Number(vol) || 0));
      guildData.volume = session.volume;
      if (session.currentResource?.volume) {
        session.currentResource.volume.setVolume(session.volume / 100);
      }
    };

    session.setLoop = (mode) => {
      session.loop = mode || 'none';
      guildData.loop = session.loop;
    };

    session.pause = (shouldPause = true) => {
      if (shouldPause) {
        player.pause();
        session.paused = true;
      } else {
        player.unpause();
        session.paused = false;
      }
    };

    session.stop = () => {
      session.skipCurrentLoop = true;
      player.stop(true);
    };

    session.seek = () => {
      // البث المباشر الحالي لا يدعم التقديم أو الترجيع الزمني
    };

    session.destroy = () => {
      session._items.length = 0;
      session.current = null;
      session.currentResource = null;
      session.playing = false;
      session.paused = false;
      session.connected = false;
      try {
        player.stop(true);
      } catch {
        // تجاهل
      }
      const conn = session.connection ?? getVoiceConnection(guildId);
      if (conn) {
        try {
          conn.destroy();
        } catch {
          // تجاهل
        }
      }
      session.connection = null;
      directSessions.delete(guildId);
    };

    directSessions.set(guildId, session);
  }

  return directSessions.get(guildId);
}

async function resolveSpotifyQuery(spotifyUrl) {
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
    // تجاهل والرجوع للمعرف
  }

  return `spotify track ${match[1]}`;
}

async function extractWithYtDlp(searchOrUrl) {
  const target = URL_PATTERN.test(searchOrUrl) ? searchOrUrl : `ytsearch1:${searchOrUrl}`;
  const { stdout } = await execFileAsync(
    YTDLP_BIN,
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
  const entry = Array.isArray(parsed?.entries) && parsed.entries.length > 0 ? parsed.entries[0] : parsed;

  if (!entry) {
    throw new Error('لم يتم العثور على مقطع');
  }

  return {
    title: entry.title || searchOrUrl,
    author: entry.uploader || entry.channel || 'مباشر',
    uri: entry.webpage_url || entry.url || searchOrUrl,
    streamUrl: entry.url || null,
    length: (Number(entry.duration) || 0) * 1000,
    isStream: Boolean(entry.is_live),
  };
}

async function resolveAudioSource(rawQuery, requester) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    throw new TitanBotError('Empty query', ErrorTypes.USER_INPUT, 'اكتب اسم الأغنية أو الرابط الأول.');
  }

  if (URL_PATTERN.test(query) && DIRECT_AUDIO_PATTERN.test(query)) {
    const cleanName = decodeURIComponent(query.split('/').pop()?.split('?')[0] || 'مقطع صوتي مباشر');
    return [
      createDirectTrack(
        {
          title: cleanName,
          author: 'رابط مباشر',
          uri: query,
          streamUrl: query,
          isStream: true,
        },
        requester,
      ),
    ];
  }

  let effectiveQuery = query;
  if (URL_PATTERN.test(query) && SPOTIFY_TRACK_PATTERN.test(query)) {
    effectiveQuery = await resolveSpotifyQuery(query);
  }

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
      `تعذر تشغيل المقطع: ${err?.message || 'خطأ غير معروف'}`,
    );
  }
}

async function buildTrackAudioResource(track, volume = 100) {
  if (track.streamUrl && DIRECT_AUDIO_PATTERN.test(track.streamUrl)) {
    const res = await fetch(track.streamUrl);
    const nodeStream = toNodeStream(res.body);
    if (!res.ok || !nodeStream) {
      throw new TitanBotError('Stream error', ErrorTypes.USER_INPUT, 'تعذر فتح الرابط الصوتي المباشر.');
    }
    const resource = createAudioResource(nodeStream, { inlineVolume: true });
    if (resource.volume) {
      resource.volume.setVolume(Math.max(0, Math.min(1, volume / 100)));
    }
    return resource;
  }

  let mediaUrl = track.streamUrl;
  if (!mediaUrl || !URL_PATTERN.test(mediaUrl)) {
    const fresh = await extractWithYtDlp(track.uri || track.title);
    mediaUrl = fresh.streamUrl;
  }

  if (!mediaUrl) {
    throw new TitanBotError('Invalid stream', ErrorTypes.USER_INPUT, 'تعذر الحصول على رابط البث الصوتي.');
  }

  const ffmpeg = spawn(
    FFMPEG_BIN,
    [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', mediaUrl,
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

  const resource = createAudioResource(ffmpeg.stdout, { inlineVolume: true });
  if (resource.volume) {
    resource.volume.setVolume(Math.max(0, Math.min(1, volume / 100)));
  }
  return resource;
}

async function playNextInSession(session) {
  const nextTrack = session._items.shift();
  if (!nextTrack) {
    session.current = null;
    session.currentResource = null;
    session.playing = false;
    return null;
  }

  session.current = nextTrack;
  const resource = await buildTrackAudioResource(nextTrack, session.volume);
  session.currentResource = resource;
  session.playing = true;
  session.paused = false;
  session.player.play(resource);
  return nextTrack;
}

async function connectSessionToVoice(session, guild, voiceChannel, textChannelId) {
  const connection = discordJoinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  session.voiceChannel = voiceChannel.id;
  session.textChannel = textChannelId;
  session.connection = connection;
  connection.subscribe(session.player);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_CONNECT_TIMEOUT_MS);
    session.connected = true;
  } catch {
    session.connected = false;
    throw new TitanBotError(
      'Voice connection failed',
      ErrorTypes.CONFIGURATION,
      'تعذر الاتصال بالقناة الصوتية. تأكد من صلاحيات الاتصال والتحدث للبوت وحاول مرة أخرى.',
    );
  }
}

function assertBotVoicePermissions(channel) {
  if (!channel) {
    throw new TitanBotError(
      'Voice channel unavailable',
      ErrorTypes.CONFIGURATION,
      'تعذر الوصول إلى القناة الصوتية.',
    );
  }

  if (!botHasPermission(channel, [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw new TitanBotError(
      'Missing voice permissions',
      ErrorTypes.PERMISSION,
      'أحتاج إلى صلاحيّتي **Connect** و**Speak** في القناة الصوتية.',
    );
  }
}

export function getPlayer(client, guildId) {
  return directSessions.get(guildId) || null;
}

export function assertInVoice(member) {
  if (!requireVoiceChannel(member)) {
    throw new TitanBotError(
      'Not in voice channel',
      ErrorTypes.USER_INPUT,
      'يجب أن تكون داخل قناة صوتية أولًا.',
    );
  }
}

export function assertCanControl(member, player) {
  if (!canControlMusic(member, player)) {
    throw new TitanBotError(
      'Wrong voice channel',
      ErrorTypes.PERMISSION,
      VOICE_CHANNEL_DENIAL,
    );
  }
}

export async function ensurePlayer(client, interaction) {
  assertInVoice(interaction.member);

  const voiceChannel = interaction.member.voice.channel;
  assertBotVoicePermissions(voiceChannel);

  const guild = interaction.guild;
  const guildId = guild.id;
  const guildData = getGuildMusicData(guildId);
  const session = getDirectSession(client, guildId);

  if (guildData.idleTimeout) {
    clearTimeout(guildData.idleTimeout);
    guildData.idleTimeout = null;
  }

  if (!session.connection || session.voiceChannel !== voiceChannel.id) {
    await connectSessionToVoice(session, guild, voiceChannel, interaction.channel?.id || null);
    guildData.playerChannelId = interaction.channel?.id || null;
  }

  session.setVolume(guildData.volume ?? 100);
  return { player: session, guildData };
}

function isDuplicateTrack(player, track) {
  const uri = track?.info?.uri;
  if (!uri) return false;
  if (player.current?.info?.uri === uri) return true;
  return player.queue.some((existing) => existing.info?.uri === uri);
}

export async function joinVoiceChannel(client, interaction) {
  assertInVoice(interaction.member);

  const guild = interaction.guild;
  const guildId = guild.id;
  const guildData = getGuildMusicData(guildId);
  const channel = interaction.member.voice.channel;
  assertBotVoicePermissions(channel);

  const session = getDirectSession(client, guildId);
  if (session.connection && session.voiceChannel !== channel.id) {
    try {
      session.connection.destroy();
    } catch {
      // تجاهل
    }
    session.connection = null;
  }

  await connectSessionToVoice(session, guild, channel, interaction.channel?.id || null);
  guildData.playerChannelId = interaction.channel?.id || null;
  session.setVolume(guildData.volume ?? 100);

  return successEmbed(
    'تم الانضمام للقناة الصوتية',
    `تم الاتصال بـ **${channel.name}** بنجاح. يمكنك استخدام أمر التشغيل المباشر الآن.`,
  );
}

export async function playQuery(client, interaction, query, options = {}) {
  const { player } = await ensurePlayer(client, interaction);
  const resolvedTracks = await resolveAudioSource(query, interaction.user);

  const track = resolvedTracks[0];
  if (!track) {
    throw new TitanBotError('No results', ErrorTypes.USER_INPUT, 'لم يتم العثور على مقطع صوتي صالح للتشغيل.');
  }

  if (isDuplicateTrack(player, track)) {
    throw new TitanBotError(
      'Duplicate track',
      ErrorTypes.USER_INPUT,
      `**${track.info.title}** موجود بالفعل في قائمة الانتظار أو قيد التشغيل.`,
    );
  }

  const willPlayNow = !player.current && !player.playing;
  player.queue.add(track);
  const queuePosition = player.queue.length;

  if (willPlayNow) {
    await playNextInSession(player);
  }

  return {
    embed: successEmbed(
      willPlayNow ? 'جاري التشغيل الآن' : 'تمت الإضافة للقائمة',
      willPlayNow
        ? `**${track.info.title}**\n${track.info.author}`
        : `**${track.info.title}**\n${track.info.author}\nالترتيب: #${queuePosition} في قائمة الانتظار`,
    ),
  };
}

export async function skipTrack(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player?.current) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا يوجد مقطع قيد التشغيل حاليًا.');
  }
  assertCanControl(interaction.member, player);

  const title = player.current.info?.title || 'غير معروف';
  if (player.loop === 'track') {
    player.setLoop('none');
  }
  player.stop();
  return successEmbed('تم التخطي', `تم تخطي **${title}**.`);
}

export async function stopPlayback(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا توجد جلسة تشغيل صوتية نشطة.');
  }
  assertCanControl(interaction.member, player);

  const guildData = getGuildMusicData(interaction.guild.id);
  const queueLength = player.queue?.length || 0;

  if (queueLength >= 5 && guildData.stopConfirmPending !== interaction.user.id) {
    guildData.stopConfirmPending = interaction.user.id;
    setTimeout(() => {
      if (guildData.stopConfirmPending === interaction.user.id) {
        guildData.stopConfirmPending = null;
      }
    }, 15_000);

    return {
      content: `قائمة الانتظار تحتوي على **${queueLength}** مقاطع. أعد كتابة أمر الإيقاف خلال 15 ثانية لتأكيد الإيقاف ومسح القائمة.`,
      ephemeral: true,
    };
  }

  guildData.stopConfirmPending = null;
  await destroyPlayerSession(client, interaction.guild.id, player, guildData);
  return successEmbed('تم الإيقاف', 'تم إيقاف التشغيل ومسح قائمة الانتظار.');
}

export async function pausePlayback(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player?.current) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا يوجد مقطع قيد التشغيل حاليًا.');
  }
  assertCanControl(interaction.member, player);

  if (player.paused) {
    return successEmbed('متوقف مؤقتًا بالفعل', 'المقطع متوقف مؤقتًا بالفعل.');
  }

  player.pause(true);
  return successEmbed('تم الإيقاف المؤقت', `تم إيقاف **${player.current.info?.title || 'المقطع'}** مؤقتًا.`);
}

export async function resumePlayback(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player?.current) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا يوجد مقطع متوقف مؤقتًا.');
  }
  assertCanControl(interaction.member, player);

  if (!player.paused) {
    return successEmbed('قيد التشغيل بالفعل', 'المقطع يعمل بالفعل.');
  }

  player.pause(false);
  return successEmbed('تم الاستئناف', `تم استئناف **${player.current.info?.title || 'المقطع'}**.`);
}

export async function setVolume(client, interaction, volume) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا توجد جلسة تشغيل صوتية نشطة.');
  }
  assertCanControl(interaction.member, player);

  const clamped = Math.max(0, Math.min(100, Number(volume)));
  if (Number.isNaN(clamped)) {
    throw new TitanBotError('Invalid volume', ErrorTypes.USER_INPUT, 'أدخل رقمًا صحيحًا بين 0 و 100.');
  }

  player.setVolume(clamped);
  return successEmbed('تم تغيير مستوى الصوت', `تم ضبط الصوت على **${clamped}%**.`);
}

export async function setLoop(client, interaction, mode) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player) {
    throw new TitanBotError('No player', ErrorTypes.USER_INPUT, 'لا توجد جلسة تشغيل صوتية نشطة.');
  }
  assertCanControl(interaction.member, player);

  const validModes = ['none', 'track', 'queue'];
  if (!validModes.includes(mode)) {
    throw new TitanBotError('Invalid loop mode', ErrorTypes.USER_INPUT, 'وضع التكرار غير صالح.');
  }

  player.setLoop(mode);
  const labels = {
    none: 'إيقاف التكرار',
    track: 'تكرار المقطع الحالي',
    queue: 'تكرار قائمة الانتظار',
  };
  return successEmbed('تم تحديث التكرار', `الوضع الحالي: **${labels[mode]}**.`);
}

export async function shuffleQueue(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player || player.queue.length < 2) {
    throw new TitanBotError('Not enough tracks', ErrorTypes.USER_INPUT, 'تحتاج إلى مقطعين على الأقل في القائمة للخلط.');
  }
  assertCanControl(interaction.member, player);

  player.queue.shuffle();
  return successEmbed('تم خلط القائمة', 'تمت إعادة ترتيب قائمة الانتظار عشوائيًا.');
}

export async function getQueue(client, interaction, page = 1) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player || (!player.current && player.queue.length === 0)) {
    throw new TitanBotError('Empty queue', ErrorTypes.USER_INPUT, 'قائمة الانتظار فارغة حاليًا.');
  }

  const pageSize = getQueuePageSize();
  const embed = buildQueueEmbed(player, page, pageSize);
  const row = buildQueuePaginationRow(player, page, pageSize);
  return { embed, components: row ? [row] : [] };
}

export async function getNowPlaying(client, interaction) {
  const player = getPlayer(client, interaction.guild.id);
  if (!player?.current) {
    throw new TitanBotError('Nothing playing', ErrorTypes.USER_INPUT, 'لا يوجد مقطع قيد التشغيل حاليًا.');
  }

  return { embed: buildNowPlayingEmbed(player) };
}

export async function replyMusicSuccess(interaction, embed, extra = {}) {
  const payload = {
    embeds: [embed],
    flags: extra.ephemeral ? MessageFlags.Ephemeral : undefined,
    ...extra,
  };
  delete payload.ephemeral;

  if (interaction.deferred || interaction.replied) {
    return InteractionHelper.safeEditReply(interaction, payload);
  }
  return interaction.reply(payload);
}
