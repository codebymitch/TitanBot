import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  joinVoiceChannel as djsJoinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
} from '@discordjs/voice';

const sessions = new Map();

function resolveCookiesPath() {
  const envPath = process.env.YTDLP_COOKIES_PATH || process.env.COOKIES_PATH;
  const candidates = [
    envPath,
    path.resolve(process.cwd(), 'cookies.txt'),
    path.resolve(process.cwd(), 'src/cookies.txt'),
    path.resolve(process.cwd(), 'src/services/music/cookies.txt'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
        return candidate;
      }
    } catch {}
  }

  return null;
}

function getOrCreateSession(guildId) {
  if (sessions.has(guildId)) {
    return sessions.get(guildId);
  }

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  const session = {
    guildId,
    connection: null,
    player,
    textChannelId: null,
    queue: [],
    current: null,
    volume: 100,
    loop: false,
    twentyFourSeven: false,
    paused: false,
    seekSeconds: 0,
    activeProcesses: [],
    nowPlayingMessageId: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    session.seekSeconds = 0;
    if (session.loop && session.current) {
      session.queue.unshift({ ...session.current });
    }
    playNextInQueue(session).catch(() => {});
  });

  player.on('error', () => {
    session.seekSeconds = 0;
    playNextInQueue(session).catch(() => {});
  });

  sessions.set(guildId, session);
  return session;
}

export function initializeMusic() {
  const cookiePath = resolveCookiesPath();
  if (cookiePath) {
    console.log(`[music] Cookies loaded from: ${cookiePath}`);
  } else {
    console.log('[music] No cookies.txt found; running without custom cookies.');
  }
}

export async function joinVoiceChannel(interaction, targetChannel = null) {
  const guild = interaction.guild;
  if (!guild) {
    throw new Error('هذا الأمر يعمل داخل السيرفرات فقط.');
  }

  const voiceChannel =
    targetChannel ||
    interaction.member?.voice?.channel ||
    guild.members.me?.voice?.channel;

  if (!voiceChannel) {
    throw new Error('يجب أن تكون داخل روم صوتي أولاً.');
  }

  const session = getOrCreateSession(guild.id);
  session.textChannelId = interaction.channelId;

  const existing = session.connection;
  if (
    existing &&
    existing.joinConfig.channelId === voiceChannel.id &&
    existing.state.status !== VoiceConnectionStatus.Destroyed
  ) {
    existing.subscribe(session.player);
    return existing;
  }

  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      existing.destroy();
    } catch {}
  }

  const connection = djsJoinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (!session.twentyFourSeven) {
        destroyPlayerSession(guild.id);
      }
    }
  });

  connection.subscribe(session.player);
  session.connection = connection;
  return connection;
}

export function getPlayer(guildId) {
  return sessions.get(guildId)?.player || null;
}

export function applyPause(guildId) {
  const session = sessions.get(guildId);
  if (!session || !session.player) return false;
  if (session.player.state.status === AudioPlayerStatus.Playing) {
    session.player.pause();
    session.paused = true;
    return true;
  }
  return false;
}

export function applyResume(guildId) {
  const session = sessions.get(guildId);
  if (!session || !session.player) return false;
  if (session.player.state.status === AudioPlayerStatus.Paused || session.paused) {
    session.player.unpause();
    session.paused = false;
    return true;
  }
  return false;
}

export function pausePlayback(guildId) {
  return applyPause(guildId);
}

export function resumePlayback(guildId) {
  return applyResume(guildId);
}

function buildYtDlpArgs(target, cookiesPath) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '-f',
    'bestaudio/best',
    '--extractor-args',
    'youtube:player_client=android,web',
    '-J',
  ];

  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  args.push(target);
  return args;
}

function runYtDlpJson(query) {
  const isUrl = /^https?:\/\//i.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;
  const cookiesPath = resolveCookiesPath();
  const args = buildYtDlpArgs(target, cookiesPath);

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`تعذر تشغيل yt-dlp: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || 'فشل جلب بيانات المقطع من المصدر.'));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const entry = Array.isArray(parsed.entries) && parsed.entries.length > 0
          ? parsed.entries[0]
          : parsed;

        if (!entry || !entry.webpage_url && !entry.url && !entry.title) {
          reject(new Error('لم يتم العثور على نتائج مطابقة.'));
          return;
        }

        const streamUrl = entry.url || entry.webpage_url || query;
        const durationSec = Number(entry.duration) || 0;
        const mins = Math.floor(durationSec / 60);
        const secs = String(durationSec % 60).padStart(2, '0');

        resolve({
          title: entry.title || query,
          url: entry.webpage_url || streamUrl,
          streamUrl,
          duration: durationSec ? `${mins}:${secs}` : 'Live / Unknown',
          durationSec,
          thumbnail: entry.thumbnail || null,
        });
      } catch {
        reject(new Error('تعذر قراءة بيانات المقطع.'));
      }
    });
  });
}

function stopActiveStreams(session) {
  while (session.activeProcesses.length > 0) {
    const child = session.activeProcesses.pop();
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

function createFfmpegStream(session, track, startSec = 0) {
  stopActiveStreams(session);
  const cookiesPath = resolveCookiesPath();

  const ytArgs = [
    '--no-playlist',
    '--no-warnings',
    '-f',
    'bestaudio/best',
    '--extractor-args',
    'youtube:player_client=android,web',
    '-o',
    '-',
  ];

  if (cookiesPath) {
    ytArgs.push('--cookies', cookiesPath);
  }
  ytArgs.push(track.url || track.streamUrl);

  const ytProc = spawn('yt-dlp', ytArgs, { stdio: ['ignore', 'pipe', 'ignore'] });

  const ffArgs = [];
  if (startSec > 0) {
    ffArgs.push('-ss', String(startSec));
  }
  ffArgs.push(
    '-i',
    'pipe:0',
    '-f',
    's16le',
    '-ar',
    '48000',
    '-ac',
    '2',
    'pipe:1'
  );

  const ffProc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'ignore'] });

  ytProc.stdout.pipe(ffProc.stdin);
  ffProc.stdin.on('error', () => {});
  ytProc.stdout.on('error', () => {});
  ffProc.stdout.on('error', () => {});

  session.activeProcesses.push(ytProc, ffProc);

  return createAudioResource(ffProc.stdout, {
    inputType: 'raw',
    inlineVolume: true,
  });
}

async function startTrack(session, track, startSec = 0) {
  session.current = track;
  session.paused = false;
  session.seekSeconds = startSec;

  const resource = createFfmpegStream(session, track, startSec);
  if (resource.volume) {
    resource.volume.setVolume(Math.max(0, Math.min(2, session.volume / 100)));
  }

  session.player.play(resource);
  await entersState(session.player, AudioPlayerStatus.Playing, 15_000).catch(() => {});
}

async function playNextInQueue(session) {
  if (!session.queue.length) {
    session.current = null;
    stopActiveStreams(session);
    if (!session.twentyFourSeven) {
      destroyPlayerSession(session.guildId);
    }
    return;
  }

  const nextTrack = session.queue.shift();
  await startTrack(session, nextTrack, 0);
}

export async function handlePlay(interaction, query) {
  const connection = await joinVoiceChannel(interaction);
  const session = getOrCreateSession(interaction.guildId);
  connection.subscribe(session.player);

  const track = await runYtDlpJson(query);
  track.requestedBy = interaction.user?.id || null;

  const isBusy =
    Boolean(session.current) ||
    session.player.state.status === AudioPlayerStatus.Playing ||
    session.player.state.status === AudioPlayerStatus.Paused;

  if (isBusy) {
    session.queue.push(track);
    const payload = {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('➕ تمت الإضافة إلى قائمة الانتظار')
          .setDescription(`**[${track.title}](${track.url})**`)
          .addFields(
            { name: 'المدة', value: track.duration, inline: true },
            { name: 'الترتيب', value: `#${session.queue.length}`, inline: true }
          ),
      ],
    };

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply(payload);
  }

  await startTrack(session, track, 0);
  const payload = buildNowPlayingReply(interaction.guildId);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

export function setVolume(guildId, level) {
  const session = sessions.get(guildId);
  const num = Number(level);
  if (!Number.isFinite(num)) return false;
  const clamped = Math.max(0, Math.min(200, Math.round(num)));
  session ? (session.volume = clamped) : null;

  const currentResource = session?.player?.state?.resource;
  if (currentResource?.volume) {
    currentResource.volume.setVolume(clamped / 100);
  }

  return clamped;
}

export function setLoopMode(guildId, mode = null) {
  const session = sessions.get(guildId);
  if (!session) return null;

  if (mode === 'on') {
    session.loop = true;
  } else if (mode === 'off') {
    session.loop = false;
  } else {
    session.loop = !session.loop;
  }

  return session.loop;
}

export function setTwentyFourSeven(guildId, mode = null) {
  const session = getOrCreateSession(guildId);

  if (mode === 'on') {
    session.twentyFourSeven = true;
  } else if (mode === 'off') {
    session.twentyFourSeven = false;
  } else {
    session.twentyFourSeven = !session.twentyFourSeven;
  }

  return session.twentyFourSeven;
}

export function seekTrack(guildId, positionInput) {
  const session = sessions.get(guildId);
  if (!session || !session.current) return false;

  let seconds = 0;
  const str = String(positionInput || '').trim();
  if (/^\d+:\d{1,2}$/.test(str)) {
    const [m, s] = str.split(':').map(Number);
    seconds = m * 60 + s;
  } else if (/^\d+$/.test(str)) {
    seconds = Number(str);
  } else {
    return false;
  }

  if (session.current.durationSec && seconds >= session.current.durationSec) {
    return false;
  }

  startTrack(session, session.current, seconds).catch(() => {});
  return seconds;
}

export function removeFromQueue(guildId, position) {
  const session = sessions.get(guildId);
  if (!session || !Array.isArray(session.queue)) return null;
  const idx = Number(position) - 1;
  if (idx < 0 || idx >= session.queue.length) return null;
  const [removed] = session.queue.splice(idx, 1);
  return removed || null;
}

export function moveInQueue(guildId, fromPos, toPos) {
  const session = sessions.get(guildId);
  if (!session || !Array.isArray(session.queue)) return null;
  const fromIdx = Number(fromPos) - 1;
  const toIdx = Number(toPos) - 1;
  if (
    fromIdx < 0 ||
    fromIdx >= session.queue.length ||
    toIdx < 0 ||
    toIdx >= session.queue.length
  ) {
    return null;
  }
  const [item] = session.queue.splice(fromIdx, 1);
  session.queue.splice(toIdx, 0, item);
  return item || null;
}

export function clearQueue(guildId) {
  const session = sessions.get(guildId);
  if (!session || !Array.isArray(session.queue) || session.queue.length === 0) {
    return false;
  }
  session.queue = [];
  return true;
}
export function destroyPlayerSession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  stopActiveStreams(session);
  session.queue = [];
  session.current = null;
  session.paused = false;
  session.seekSeconds = 0;

  try {
    session.player.stop(true);
  } catch {}

  if (session.connection && session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      session.connection.destroy();
    } catch {}
  }

  sessions.delete(guildId);
}

export function buildNowPlayingReply(guildId) {
  const session = sessions.get(guildId);
  const track = session?.current;

  if (!track) {
    return {
      content: '📭 لا يوجد مقطع قيد التشغيل حالياً.',
      embeds: [],
      components: [],
    };
  }

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('🎵 يتم التشغيل الآن')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'المدة', value: track.duration || 'غير معروفة', inline: true },
      { name: 'الصوت', value: `${session.volume ?? 100}%`, inline: true },
      { name: 'التكرار', value: session.loop ? 'مفعل' : 'متوقف', inline: true },
      { name: '24/7', value: session.twentyFourSeven ? 'مفعل' : 'متوقف', inline: true },
      { name: 'في الانتظار', value: `${session.queue?.length || 0}`, inline: true }
    );

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause_resume')
      .setLabel(session.paused ? 'استئناف' : 'إيقاف مؤقت')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('تخطي')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('إيقاف')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setLabel(session.loop ? 'تكرار: تشغيل' : 'تكرار: إيقاف')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

export function buildQueueReply(guildId) {
  const session = sessions.get(guildId);
  if (!session || (!session.current && (!session.queue || session.queue.length === 0))) {
    return {
      content: '📭 قائمة الانتظار فارغة حالياً.',
      embeds: [],
      components: [],
    };
  }

  const lines = [];
  if (session.current) {
    lines.push(`**الحالي:** [${session.current.title}](${session.current.url}) \`[${session.current.duration}]\``);
  }

  if (Array.isArray(session.queue) && session.queue.length > 0) {
    lines.push('');
    session.queue.slice(0, 10).forEach((item, idx) => {
      lines.push(`**${idx + 1}.** [${item.title}](${item.url}) \`[${item.duration}]\``);
    });

    if (session.queue.length > 10) {
      lines.push(`\n*... و ${session.queue.length - 10} مقاطع أخرى في القائمة.*`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 قائمة الانتظار')
    .setDescription(lines.join('\n'));

  return {
    embeds: [embed],
    components: [],
  };
}

export async function replyMusicSuccess(interaction, message, ephemeral = false) {
  const payload = {
    content: message,
    ...(ephemeral ? { ephemeral: true } : {}),
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

export async function replyMusicError(interaction, message, ephemeral = true) {
  const payload = {
    content: `❌ ${message}`,
    ...(ephemeral ? { ephemeral: true } : {}),
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

export async function handleSkip(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session || (!session.current && session.queue.length === 0)) {
    return replyMusicError(interaction, 'لا يوجد مقطع حالي أو مقاطع في الانتظار لتخطيها.', true);
  }

  session.seekSeconds = 0;
  stopActiveStreams(session);
  await playNextInQueue(session);

  if (session.current) {
    const payload = buildNowPlayingReply(interaction.guildId);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply(payload);
  }

  return replyMusicSuccess(interaction, '⏭️ تم التخطي وانتهت قائمة الانتظار.');
}

export async function handleStop(interaction) {
  const session = sessions.get(interaction.guildId);
  if (!session && !interaction.guild?.members?.me?.voice?.channel) {
    return replyMusicError(interaction, 'لا يوجد تشغيل نشط حالياً.', true);
  }

  destroyPlayerSession(interaction.guildId);
  return replyMusicSuccess(interaction, '⏹️ تم إيقاف التشغيل ومغادرة الروم الصوتي.');
}

export async function handleQueue(interaction) {
  const payload = buildQueueReply(interaction.guildId);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

export async function handleMusicComponent(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId;
  if (!id || !id.startsWith('music_')) return false;

  const guildId = interaction.guildId;
  if (!guildId) return false;

  if (id === 'music_pause_resume') {
    const session = sessions.get(guildId);
    if (!session) {
      await replyMusicError(interaction, 'لا يوجد مشغل نشط.', true);
      return true;
    }

    if (session.paused || session.player.state.status === AudioPlayerStatus.Paused) {
      applyResume(guildId);
    } else {
      applyPause(guildId);
    }

    await interaction.update(buildNowPlayingReply(guildId));
    return true;
  }

  if (id === 'music_skip') {
    await interaction.deferUpdate();
    await handleSkip(interaction);
    return true;
  }

  if (id === 'music_stop') {
    destroyPlayerSession(guildId);
    await interaction.update({
      content: '⏹️ تم إيقاف التشغيل.',
      embeds: [],
      components: [],
    });
    return true;
  }

  if (id === 'music_loop') {
    setLoopMode(guildId);
    await interaction.update(buildNowPlayingReply(guildId));
    return true;
  }

  return false;
}
