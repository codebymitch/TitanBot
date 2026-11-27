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

const URL_PATTERN = /^https?:\/\/\S+\$/i;
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
      if (session.currentResource?.volume) {
        session.currentResource.volume.setVolume(session.volume / 100);
      }
    };

    session.setLoop = (mode) => {
      session.loop = mode || 'none';
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

async function resolveAudioSource(rawQuery, requester) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    throw new TitanBotError('Empty query', ErrorTypes.USER_INPUT, 'يرجى إدخال رابط صوتي مباشر أو اسم للملف.');
  }

  if (URL_PATTERN.test(query)) {
    const cleanName = decodeURIComponent(query.split('/').pop()?.split('?')[0] || 'مقطع صوتي مباشر');
    return [
      createDirectTrack(
        {
          title: cleanName,
          author: 'رابط صوتي مباشر',
          uri: query,
          isStream: true,
        },
        requester,
      ),
    ];
  }

  // محاولة البحث المباشر إذا كانت مكتبة play-dl مثبتة داخل المشروع بدون وسيط خارجي
  try {
    const mod = await import('play-dl');
    const playDl = mod.default ?? mod;
    if (typeof playDl.search === 'function') {
      const results = await playDl.search(query, { limit: 1 });
      const first = Array.isArray(results) ? results[0] : null;
      if (first?.url) {
        return [
          createDirectTrack(
            {
              title: first.title || query,
              author: first.channel?.name || 'مصدر مباشر',
              uri: first.url,
              length: (first.durationInSec || 0) * 1000,
              isStream: false,
            },
            requester,
          ),
        ];
      }
    }
  } catch {
    // عدم توفر مكتبة بحث إضافية لا يمنع تشغيل الروابط المباشرة
  }

  throw new TitanBotError(
    'Direct URL required',
    ErrorTypes.USER_INPUT,
    'التشغيل المباشر بدون وسيط يدعم الروابط الصوتية المباشرة حاليًا. أرسل رابطًا صوتيًا مباشرًا (مثل `.mp3` أو `.ogg`).',
  );
}

async function buildTrackAudioResource(track, volume = 100) {
  let stream = null;

  if (track.uri && URL_PATTERN.test(track.uri)) {
    // إذا كان الرابط متاحًا عبر play-dl stream نستخدمه، وإلا نستخدم fetch المباشر
    try {
      const mod = await import('play-dl');
      const playDl = mod.default ?? mod;
      if (typeof playDl.stream === 'function' && !/\.(mp3|ogg|wav|m4a|flac)(\?.*)?\$/i.test(track.uri)) {
        const streamInfo = await playDl.stream(track.uri);
        stream = streamInfo?.stream ?? null;
      }
    } catch {
      // الانتقال إلى fetch المباشر
    }

    if (!stream) {
      const res = await fetch(track.uri);
      if (!res.ok || !res.body) {
        throw new TitanBotError('Stream error', ErrorTypes.USER_INPUT, 'تعذر فتح البث من الرابط الصوتي المباشر.');
      }
      stream = toNodeStream(res.body);
    }
  }

  if (!stream) {
    throw new TitanBotError('Invalid stream', ErrorTypes.USER_INPUT, 'تعذر تجهيز المصدر الصوتي للتشغيل.');
  }

  const resource = createAudioResource(stream, {
    inlineVolume: true,
  });

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
