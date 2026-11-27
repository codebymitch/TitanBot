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
    const parsed = new URL(value);
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

export function getPlayer(guildId) {
  return getPlayerState(guildId);
}

export function replyMusicSuccess(interaction, message, ephemeral = false) {
  const payload = {
    embeds: [buildMusicInfoEmbed(message)],
    ephemeral,
  };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ embeds: payload.embeds });
  }
  return interaction.reply(payload);
}

export function replyMusicError(interaction, message, ephemeral = true) {
  const payload = {
    embeds: [buildMusicErrorEmbed(message)],
    ephemeral,
  };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ embeds: payload.embeds });
  }
  return interaction.reply(payload);
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

export function clearQueue(guildId) {
  const state = getPlayerState(guildId);
  if (!state) return false;
  state.queue = [];
  setPlayerState(guildId, state);
  return true;
}

export async function resolveTrack(query, requestedBy) {
  const input = isUrl(query) ? query.trim() : `ytsearch1:${query.trim()}`;

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--prefer-free-formats',
      '-f',
      'bestaudio/best',
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
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Could not find the requested track.'));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const entry = Array.isArray(parsed.entries) && parsed.entries.length > 0
          ? parsed.entries[0]
          : parsed;

        if (!entry || (!entry.webpage_url && !entry.url)) {
          reject(new Error('No valid playable stream URL found for this track.'));
          return;
        }

        const sourceUrl = entry.webpage_url || entry.url;
        const durationSec = Number(entry.duration || 0);

        resolve({
          title: entry.title || 'Audio Track',
          url: sourceUrl,
          streamTarget: entry.url || sourceUrl,
          duration: formatDuration(durationSec),
          durationSec,
          thumbnail: entry.thumbnail || null,
          author: entry.uploader || entry.channel || 'Unknown',
          requestedBy,
        });
      } catch (err) {
        reject(new Error(`Failed to parse track metadata: ${err.message}`));
      }
    });
  });
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

  ytdlp.stderr.on('data', () => {});
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
  const guild = interaction.guild;
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
  if (interactionOrGuild?.guild && voiceChannel) {
    return ensureVoiceConnection(interactionOrGuild, voiceChannel);
  }
  const guild = interactionOrGuild;
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
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return replyMusicError(interaction, 'Join a voice channel first so I can play audio.', true);
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  try {
    const track = await resolveTrack(query, interaction.user);
    const connection = await ensureVoiceConnection(interaction, voiceChannel);

    let state = getPlayerState(interaction.guild.id);

    if (!state) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });

      state = {
        guildId: interaction.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannel: interaction.channel,
        connection,
        player,
        queue: [],
        currentTrack: null,
        isPlaying: false,
        volume: 100,
        cleanupStream: null,
      };

      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, async () => {
        const current = getPlayerState(interaction.guild.id);
        if (!current) return;
        if (current.loop && current.currentTrack) {
          current.queue.unshift(current.currentTrack);
        }
        setPlayerState(interaction.guild.id, current);
        await playNextInQueue(interaction.guild.id, interaction.client);
      });

      player.on('error', async () => {
        await playNextInQueue(interaction.guild.id, interaction.client);
      });

      setPlayerState(interaction.guild.id, state);
    } else {
      state.voiceChannelId = voiceChannel.id;
      state.textChannel = interaction.channel;
      connection.subscribe(state.player);
    }

    const shouldStartNow = !state.currentTrack && state.player.state.status !== AudioPlayerStatus.Playing;
    state.queue.push(track);
    setPlayerState(interaction.guild.id, state);

    if (shouldStartNow) {
      await playNextInQueue(interaction.guild.id, interaction.client);
      const latestState = getPlayerState(interaction.guild.id);
      return interaction.editReply({
        embeds: [buildNowPlayingEmbed(latestState?.currentTrack || track, latestState)],
      });
    }

    return replyMusicSuccess(
      interaction,
      `Added **${track.title}** to the queue (position: ${state.queue.length}).`
    );
  } catch (error) {
    return replyMusicError(
      interaction,
      error.message || 'An error occurred while trying to play the track.'
    );
  }
}

export async function playQuery(interaction, query) {
  return handlePlay(interaction, query);
}

export async function handleSkip(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state || !state.currentTrack) {
    return replyMusicError(interaction, 'There is no track currently playing to skip.', true);
  }

  state.player.stop(true);
  return replyMusicSuccess(interaction, 'Skipped the current track.');
}

export async function handleStop(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state) {
    return replyMusicError(interaction, 'The bot is not currently playing audio.', true);
  }

  leaveVoiceChannel(interaction.guild.id);

  return replyMusicSuccess(interaction, 'Stopped playback and left the voice channel.');
}

export async function handleQueue(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state || (!state.currentTrack && (!state.queue || state.queue.length === 0))) {
    return replyMusicSuccess(interaction, 'The queue is currently empty.', true);
  }

  return interaction.reply({
    embeds: [buildQueueEmbed(state)],
  });
}
