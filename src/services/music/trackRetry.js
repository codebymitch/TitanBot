// trackRetry.js — a song that fails to play is tried again from another source (report #227), in our
// server only.
//
// The public Lavalink nodes often fail on some songs (a playlist of 72 had 7 "Failed to play … Skipping").
// Instead of skipping, the bot searches the same song (title + artist) on YouTube, then SoundCloud, and
// plays the first copy it finds next. Only when no copy plays is the song skipped, with one short line in
// the channel; a copy that plays says nothing, so a playlist no longer floods the channel.

import { isHomeGuild } from '../../config/homeGuild.js';
import { logger } from '../../utils/logger.js';

export const RETRY_SOURCES = ['ytsearch', 'scsearch'];

const PLAYABLE = new Set(['search', 'track', 'SEARCH_RESULT', 'TRACK_LOADED']);

/** The search text for a failed track: its title and artist. */
export function retryQuery(track) {
    const title = track?.info?.title?.trim();
    if (!title) return null;
    const author = track.info.author?.trim();
    return author && !title.toLowerCase().includes(author.toLowerCase()) ? `${title} ${author}` : title;
}

/**
 * Finds another copy of a failed track and queues it next. Returns the copy, or null when there is none
 * (another server, a copy that failed too, or nothing found).
 */
export async function retryFailedTrack(client, player, track) {
    if (!isHomeGuild(player?.guildId) || !client.riffy || track?.info?.retryOf) return null;
    const query = retryQuery(track);
    if (!query) return null;

    for (const source of RETRY_SOURCES) {
        const result = await client.riffy.resolve({ query, source, requester: track.info.requester }).catch((error) => {
            logger.warn(`[MUSIC] Retry search on ${source} failed for "${query}": ${error.message}`);
            return null;
        });
        if (!PLAYABLE.has(result?.loadType)) continue;
        const copy = result.tracks?.find((candidate) => candidate?.info?.identifier && candidate.info.identifier !== track.info.identifier);
        if (!copy) continue;

        copy.info.requester = track.info.requester;
        copy.info.retryOf = track.info.identifier || query;
        player.queue.unshift(copy);
        if (!player.playing && !player.paused) await player.play();
        logger.info(`[MUSIC] "${track.info.title}" failed; playing a copy from ${source} instead.`);
        return copy;
    }
    return null;
}

/** The line posted when a song could not be played from any source. */
export function failedTrackLine(track) {
    return `⚠️ **${track?.info?.title || 'أغنية'}** مش شغالة من أي مصدر، اتخطت.`;
}
