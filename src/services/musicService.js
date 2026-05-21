import { Player } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import { createRequire } from 'module';
import { logger } from '../utils/logger.js';
import { t } from './i18n.js';

const require = createRequire(import.meta.url);

let _player = null;

export function getPlayer() {
  return _player;
}

/**
 * Convert Netscape HTTP cookie file format to an HTTP Cookie header string.
 * Netscape format: domain TAB flag TAB path TAB secure TAB expiry TAB name TAB value
 * Output format:  name=value; name2=value2  (standard Cookie header)
 */
function parseCookiesToHeader(netscapeContent) {
  if (!netscapeContent) return null;
  try {
    return netscapeContent
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#') && line.includes('\t'))
      .map(line => {
        const parts = line.split('\t');
        if (parts.length >= 7) {
          const name = parts[5]?.trim();
          const value = parts[6]?.trim();
          if (name && value) return `${name}=${value}`;
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');
  } catch (e) {
    logger.warn('musicService: failed to parse YOUTUBE_COOKIE', { error: e?.message });
    return null;
  }
}

/**
 * Create and configure the discord-player instance.
 *
 * Sources (priority): YouTube (via youtubei.js + BotGuard), Spotify
 * metadata → resolved to YouTube audio, SoundCloud, Apple Music,
 * Attachments.
 *
 * YoutubeiExtractor is configured with innertubeClient: 'TV_EMBEDDED'
 * which avoids YouTube's bot-detection checks that block the default
 * WEB client. The bgutils-js + jsdom stack handles BotGuard challenges
 * automatically.
 */
export async function initMusic(client) {
  if (_player) return _player;

  // Log installed versions so Railway logs confirm which youtubei.js
  // resolved — pinning to v14.0.0 caused the "Failed to extract
  // signature decipher algorithm" error and broke all YouTube playback.
  try {
    const ytiVer = require('youtubei.js/package.json').version;
    const dpyVer = require('discord-player-youtubei/package.json').version;
    logger.warn(`musicService: youtubei.js@${ytiVer}, discord-player-youtubei@${dpyVer}`);
  } catch (e) {
    logger.warn('musicService: could not read package versions', { error: e?.message });
  }

  // discord-player v7 — no ytdlOptions needed (we use youtubei, not ytdl)
  const player = new Player(client);

  // ── Load default extractors (Spotify, SoundCloud, Apple Music, etc.) ──
  try {
    await player.extractors.loadMulti(DefaultExtractors);
    logger.info('musicService: DefaultExtractors loaded');
  } catch (err) {
    logger.error('musicService: failed to load DefaultExtractors', { error: err?.message });
  }

  // ── YouTube via youtubei.js (discord-player-youtubei) ──
  // useClient: 'IOS' avoids YouTube's signature-decipher entirely.
  // On cloud hosts (Railway, etc.) YouTube blocks anonymous streams.
  // YOUTUBE_COOKIE must be in Netscape format (exported from browser).
  // We convert it to HTTP Cookie header format (name=value; name2=value2)
  // and pass it via streamOptions.cookie.
  // NOTE: `authentication` expects an OAuth2 token (access_token=XXX),
  // NOT cookies — never pass raw Netscape cookies to `authentication`.
  const rawCookie = process.env.YOUTUBE_COOKIE || null;
  const cookieHeader = rawCookie ? parseCookiesToHeader(rawCookie) : null;

  if (cookieHeader) {
    const cookieCount = cookieHeader.split(';').length;
    logger.info(`musicService: YOUTUBE_COOKIE parsed — ${cookieCount} cookies loaded for authenticated YT session`);
  } else {
    logger.warn('musicService: YOUTUBE_COOKIE not set — YouTube streams may be blocked on cloud hosts');
  }

  // Build extractor options — try IOS first (no signature decipher needed),
  // fall back to TV_EMBEDDED (more lenient on cloud IPs).
  const makeExtractorOpts = (client) => ({
    streamOptions: {
      useClient: client,
      ...(cookieHeader && { cookie: cookieHeader }),
    },
  });

  let youtubeRegistered = false;
  for (const clientName of ['IOS', 'TV_EMBEDDED', 'ANDROID']) {
    try {
      await player.extractors.register(YoutubeiExtractor, makeExtractorOpts(clientName));
      logger.info(`musicService: YoutubeiExtractor registered (${clientName}${cookieHeader ? ', authenticated' : ', anonymous'})`);
      youtubeRegistered = true;
      break;
    } catch (err) {
      logger.warn(`musicService: ${clientName} client failed — ${err?.message}`);
    }
  }

  if (!youtubeRegistered) {
    logger.error('musicService: failed to register YoutubeiExtractor with any client — YouTube will not work');
  }

  const registeredCount = player.extractors.size;
  logger.info(`musicService: ${registeredCount} extractors active`);

  if (registeredCount === 0) {
    logger.warn('musicService: no extractors registered — /music play will not work');
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

  // Surface stream/player errors to the text channel so they're visible
  player.events.on('playerError', (queue, err, track) => {
    const errMsg = String(err?.message || err);
    logger.error('music playerError', { track: track?.title, error: errMsg, stack: err?.stack?.slice(0, 500) });
    const L = lang(queue);
    queue.metadata?.channel?.send({
      embeds: [{
        color: 0xef4444,
        title: t(L, 'wolf.music.errorTitle'),
        description: `❌ \`${track?.title?.slice(0, 80) || 'Pista'}\`\n\`\`\`${errMsg.slice(0, 500)}\`\`\``,
      }],
    }).catch(() => {});
  });

  player.events.on('error', (queue, err) => {
    logger.error('music queue error', { error: err?.message, stack: err?.stack?.slice(0, 500) });
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
  logger.info('Music player ready (YouTube/Spotify/SoundCloud)');
  return player;
}
