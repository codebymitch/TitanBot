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
    const connection = await ensureVoice
