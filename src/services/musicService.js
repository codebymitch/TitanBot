import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { logger } from '../utils/logger.js';
import { t } from './i18n.js';

let _player = null;

export function getPlayer() {
  return _player;
}

/**
 * Create and configure the discord-player instance.
 *
 * Sources (priority): Spotify metadata (resolved to YouTube), YouTube,
 * SoundCloud, Apple Music, AttachmentExtractor, free-text search. The
 * Spotify extractor only reads the public playlist/track metadata —
 * actual audio is matched on YouTube (Spotify TOS prohibits direct
 * streaming through third-party bots).
 *
 * The bot's access gate in interactionCreate already filters /music
 * out of non-approved guilds, so no extra gating is needed here.
 */
export async function initMusic(client) {
  if (_player) return _player;

  const player = new Player(client, {
    ytdlOptions: { quality: 'highestaudio', highWaterMark: 1 << 25 },
  });

  try {
    await player.extractors.loadMulti(DefaultExtractors);
  } catch (err) {
    logger.error('musicService: failed to load DefaultExtractors', { error: err?.message });
  }

  const lang = (queue) => queue.metadata?.lang === 'en' ? 'en' : 'es';

  // ── User-facing events ─────────────────────────────────────────
  player.events.on('playerStart', (queue, track) => {
    const channel = queue.metadata?.channel;
    if (!channel) return;
    const L = lang(queue);
    channel.send({
      embeds: [{
        color: 0x7b6cff,
        author: { name: t(L, 'wolf.music.nowPlayingHeader') },
        title: track.title?.slice(0, 250) || 'Track',
        url: track.url,
        description: `**${track.author}** · \`${track.duration}\``,
        thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
        footer: { text: t(L, 'wolf.music.nowPlayingFooter', { user: track.requestedBy?.tag || 'anonymous' }) },
      }],
    }).catch(() => {});
  });

  player.events.on('audioTracksAdd', (queue, tracks) => {
    const L = lang(queue);
    queue.metadata?.channel?.send({
      embeds: [{
        color: 0x36d6c3,
        title: t(L, 'wolf.music.playlistFull'),
        description: t(L, 'wolf.music.playlistTracks', { count: tracks.length }),
      }],
    }).catch(() => {});
  });

  player.events.on('emptyQueue', (queue) => {
    const L = lang(queue);
    queue.metadata?.channel?.send({
      embeds: [{
        color: 0x5b6072,
        description: t(L, 'wolf.music.queueEnded'),
      }],
    }).catch(() => {});
  });

  player.events.on('playerError', (queue, err) => {
    logger.error('music playerError', { error: err?.message });
  });

  player.events.on('error', (queue, err) => {
    logger.error('music queue error', { error: err?.message });
    const L = lang(queue);
    queue.metadata?.channel?.send({
      embeds: [{
        color: 0xef4444,
        title: t(L, 'wolf.music.errorTitle'),
        description: '```' + String(err?.message || err).slice(0, 600) + '```',
      }],
    }).catch(() => {});
  });

  _player = player;
  logger.info('Music player ready (sources: Spotify/YouTube/SoundCloud)');
  return player;
}
