import { spawn } from 'node:child_process';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
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
    connection = joinVoiceChannel({
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
    return interaction.reply({
      embeds: [buildMusicErrorEmbed('Join a voice channel first so I can play audio.')],
      ephemeral: true,
    });
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

    return interaction.editReply({
      embeds: [buildMusicInfoEmbed(`Added **${track.title}** to the queue (position: ${state.queue.length}).`)],
    });
  } catch (error) {
    return interaction.editReply({
      embeds: [buildMusicErrorEmbed(error.message || 'An error occurred while trying to play the track.')],
    });
  }
}

export async function handleSkip(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state || !state.currentTrack) {
    return interaction.reply({
      embeds: [buildMusicErrorEmbed('There is no track currently playing to skip.')],
      ephemeral: true,
    });
  }

  state.player.stop(true);
  return interaction.reply({
    embeds: [buildMusicInfoEmbed('Skipped the current track.')],
  });
}

export async function handleStop(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state) {
    return interaction.reply({
      embeds: [buildMusicErrorEmbed('The bot is not currently playing audio.')],
      ephemeral: true,
    });
  }

  if (typeof state.cleanupStream === 'function') {
    state.cleanupStream();
  }
  state.queue = [];
  state.currentTrack = null;

  try {
    state.player.stop(true);
  } catch {}

  try {
    const connection = getVoiceConnection(interaction.guild.id);
    if (connection) connection.destroy();
  } catch {}

  clearPlayerState(interaction.guild.id);

  return interaction.reply({
    embeds: [buildMusicInfoEmbed('Stopped playback and left the voice channel.')],
  });
}

export async function handleQueue(interaction) {
  const state = getPlayerState(interaction.guild.id);
  if (!state || (!state.currentTrack && (!state.queue || state.queue.length === 0))) {
    return interaction.reply({
      embeds: [buildMusicInfoEmbed('The queue is currently empty.')],
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [buildQueueEmbed(state)],
  });
}
