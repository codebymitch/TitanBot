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
  buildNowPlayingEmbed,
  buildQueueEmbed,
  buildMusicErrorEmbed,
  buildMusicInfoEmbed,
  buildPlayerButtonRows,
} from './musicEmbeds.js';

export function initializeMusic(client) {
  if (!client) return;
  if (!client.music) {
    client.music = {
      directMode: true,
    };
  }
}

function isUrl(value) {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
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

  try {
    if (ctx.deferred || ctx.replied) {
      if (typeof ctx.editReply === 'function') {
        return await ctx.editReply({
          embeds: payload.embeds,
          components: payload.components ?? [],
        });
      }
    }

    if (typeof ctx.reply === 'function') {
      return await ctx.reply(payload);
    }

    if (typeof ctx.followUp === 'function') {
      return await ctx.followUp(payload);
    }

    if (typeof ctx.editReply === 'function') {
      return await ctx.editReply({
        embeds: payload.embeds,
        components: payload.components ?? [],
      });
    }

    if (ctx.channel && typeof ctx.channel.send === 'function') {
      return await ctx.channel.send({
        embeds: payload.embeds,
        components: payload.components ?? [],
      });
    }
  } catch {
    if (ctx.channel && typeof ctx.channel.send === 'function') {
      return await ctx.channel.send({
        embeds: payload.embeds,
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
  return clampedSec;
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

function runYtDlpJson(input, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--skip-download',
      ...extraArgs,
      input,
    ];

    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp binary error: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const entry = Array.isArray(parsed.entries) && parsed.entries.length > 0
          ? parsed.entries[0]
          : parsed;

        if (!entry || (!entry.webpage_url && !entry.url && !entry.id)) {
          reject(new Error('Empty metadata returned by yt-dlp'));
          return;
        }

        const sourceUrl =
          entry.webpage_url ||
          (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : entry.url);

        resolve({
          title: entry.title || 'Audio Track',
          url: sourceUrl,
          streamTarget: entry.url || sourceUrl,
          durationSec: Number(entry.duration || 0),
          thumbnail: entry.thumbnail || null,
          author: entry.uploader || entry.channel || 'Unknown',
        });
      } catch (err) {
        reject(new Error(`Metadata JSON parse error: ${err.message}`));
      }
    });
  });
}

export async function resolveTrack(query, requestedBy) {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) {
    throw new Error('Please enter a song name or link.');
  }

  const input = isUrl(rawQuery) ? rawQuery : `ytsearch1:${rawQuery}`;
  const attempts = [
    ['-f', 'bestaudio/best'],
    ['--extractor-args', 'youtube:player_client=android,web'],
    [],
  ];

  let lastError = null;

  for (const args of attempts) {
    try {
      const meta = await runYtDlpJson(input, args);
      return {
        ...meta,
        duration: formatDuration(meta.durationSec),
        requestedBy,
      };
    } catch (err) {
      lastError = err;
    }
  }

  console.error('[RESOLVE TRACK FAILED]:', lastError?.message || lastError);
  throw new Error(lastError?.message || 'Could not resolve the requested track.');
}

function createAudioStreamFromTrack(track) {
  const target = track.url || track.streamTarget;

  const ytdlp = spawn(
    'yt-dlp',
    [
      '-o',
      '-',
      '-q',
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bestaudio/best',
      target,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-analyzeduration',
      '0',
      '-loglevel',
      '0',
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

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
    inputType: prism.opus.Encoder ? 'opus' : undefined,
    inlineVolume: true,
  });

  return {
    resource,
    cleanup: () => {
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

export async function ensureVoiceConnection(interaction, voiceChannel) {
  const ctx = interaction?.interaction || interaction;
  const guild = ctx.guild;
  let connection = getVoiceConnection(guild.id);

  if (!connection) {
    connection = joinDiscordVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      try {
        connection.destroy();
      } catch {}
      clearPlayerState(guild.id);
    }
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  return connection;
}

export async function joinVoiceChannel(interactionOrGuild, voiceChannel) {
  const ctx = interactionOrGuild?.interaction || interactionOrGuild;
  if (ctx?.guild && voiceChannel) {
    return ensureVoiceConnection(ctx, voiceChannel);
  }
  const guild = ctx;
  const existing = getVoiceConnection(guild.id);
  if (existing) return existing;

  const connection = joinDiscordVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  return connection;
}

export function leaveVoiceChannel(guildIdOrInteraction) {
  return destroyPlayerSession(guildIdOrInteraction);
}

export async function playNextInQueue(guildId, client) {
  const state = getPlayerState(guildId);
  if (!state) return;

  if (typeof state.cleanupStream === 'function') {
    state.cleanupStream();
    state.cleanupStream = null;
  }

  if (!Array.isArray(state.queue) || state.queue.length === 0) {
    state.currentTrack = null;
    state.isPlaying = false;
    setPlayerState(guildId, state);
    return;
  }

  const nextTrack = state.queue.shift();
  state.currentTrack = nextTrack;
  state.isPlaying = true;
  state.seekSeconds = 0;

  const { resource, cleanup } = createAudioStreamFromTrack(nextTrack);
  if (resource.volume) {
    resource.volume.setVolume(Math.max(0, Math.min(1, (state.volume ?? 100) / 100)));
  }

  state.cleanupStream = cleanup;
  setPlayerState(guildId, state);

  state.player.play(resource);

  if (state.textChannel) {
    const embed = buildNowPlayingEmbed(nextTrack, state);
    await state.textChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

export async function handlePlay(interaction, query) {
  const ctx = interaction?.interaction || interaction;
  const member = ctx?.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return replyMusicError(ctx, 'Join a voice channel first so I can play audio.', true);
  }

  try {
    if (!ctx.deferred && !ctx.replied && typeof ctx.deferReply === 'function') {
      await ctx.deferReply();
    }
  } catch {}

  try {
    const track = await resolveTrack(query, ctx.user || ctx.author);
    const connection = await ensureVoiceConnection(ctx, voiceChannel);

    let state = getPlayerState(ctx.guild.id);

    if (!state) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });

      state = {
        guildId: ctx.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannel: ctx.channel,
        connection,
        player,
        queue: [],
        currentTrack: null,
        isPlaying: false,
        volume: 100,
        seekSeconds: 0,
        loop: false,
        twentyFourSeven: false,
        cleanupStream: null,
      };

      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, async () => {
        const current = getPlayerState(ctx.guild.id);
        if (!current) return;
        if (current.loop && current.currentTrack) {
          current.queue.unshift(current.currentTrack);
        }
        setPlayerState(ctx.guild.id, current);
        await playNextInQueue(ctx.guild.id, ctx.client);
      });

      player.on('error', async () => {
        await playNextInQueue(ctx.guild.id, ctx.client);
      });

      setPlayerState(ctx.guild.id, state);
    } else {
      state.voiceChannelId = voiceChannel.id;
      state.textChannel = ctx.channel;
      connection.subscribe(state.player);
    }

    const shouldStartNow = !state.currentTrack && state.player.state.status !== AudioPlayerStatus.Playing;
    state.queue.push(track);
    setPlayerState(ctx.guild.id, state);

    if (shouldStartNow) {
      await playNextInQueue(ctx.guild.id, ctx.client);
      const latestState = getPlayerState(ctx.guild.id);
      return safeSendMusicPayload(ctx, {
        embeds: [buildNowPlayingEmbed(latestState?.currentTrack || track, latestState)],
        components: buildPlayerButtonRows(latestState),
      });
    }

    return replyMusicSuccess(
      ctx,
      `Added **${track.title}** to the queue (position: ${state.queue.length}).`
    );
  } catch (error) {
    return replyMusicError(
      ctx,
      error.message || 'An error occurred while trying to play the track.'
    );
  }
}

export async function playQuery(interaction, query) {
  return handlePlay(interaction, query);
}

export async function handleSkip(interaction) {
  const ctx = interaction?.interaction || interaction;
  const state = getPlayerState(ctx.guild.id);
  if (!state || !state.currentTrack) {
    return replyMusicError(ctx, 'There is no track currently playing to skip.', true);
  }

  state.player.stop(true);
  return replyMusicSuccess(ctx, 'Skipped the current track.');
}

export async function handleStop(interaction) {
  const ctx = interaction?.interaction || interaction;
  const state = getPlayerState(ctx.guild.id);
  if (!state) {
    return replyMusicError(ctx, 'The bot is not currently playing audio.', true);
  }

  destroyPlayerSession(ctx.guild.id);

  return replyMusicSuccess(ctx, 'Stopped playback and left the voice channel.');
}

export async function handleQueue(interaction) {
  const ctx = interaction?.interaction || interaction;
  const state = getPlayerState(ctx.guild.id);
  if (!state || (!state.currentTrack && (!state.queue || state.queue.length === 0))) {
    return replyMusicSuccess(ctx, 'The queue is currently empty.', true);
  }

  return safeSendMusicPayload(ctx, {
    embeds: [buildQueueEmbed(state)],
  });
}
