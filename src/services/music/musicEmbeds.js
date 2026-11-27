import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPaginationRow } from '../../utils/components.js';
import { getGuildMusicData } from './playerStore.js';

const QUEUE_PAGE_SIZE = 10;

export const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
};

export function formatDuration(ms) {
    if (!ms || Number.isNaN(ms) || ms <= 0) {
        return 'Live';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getTrackArtwork(track) {
    return track?.info?.artworkUrl || track?.info?.thumbnail || track?.artworkUrl || track?.thumbnail || null;
}

function detectTrackSource(track) {
    const uri = String(track?.info?.uri || track?.uri || '').toLowerCase();
    const rawSource = String(
        track?.info?.sourceName || track?.info?.source || track?.sourceName || track?.source || '',
    ).toLowerCase();

    if (uri.includes('spotify.com') || uri.startsWith('spotify:') || rawSource.includes('spotify')) {
        return 'Spotify';
    }
    if (uri.includes('youtube.com') || uri.includes('youtu.be') || rawSource.includes('youtube')) {
        return 'YouTube';
    }
    if (uri.includes('soundcloud.com') || rawSource.includes('soundcloud')) {
        return 'SoundCloud';
    }
    if (rawSource) {
        return rawSource.charAt(0).toUpperCase() + rawSource.slice(1);
    }
    return uri ? 'Link' : 'Stream';
}

function formatTrackTitle(track) {
    const title = track?.info?.title || track?.title || 'Unknown track';
    const uri = track?.info?.uri || track?.uri;
    return uri ? `[${title}](${uri})` : title;
}

function getLoopLabel(loop) {
    switch (loop) {
        case 'track':
            return 'Track';
        case 'queue':
            return 'Queue';
        default:
            return 'Off';
    }
}

export function buildNowPlayingEmbed(trackOrPlayer, maybePlayer = null, maybeGuildData = null) {
    const isPlayerArg = Boolean(trackOrPlayer?.current || trackOrPlayer?.queue);
    const player = isPlayerArg ? trackOrPlayer : maybePlayer;
    const track = isPlayerArg ? player?.current : trackOrPlayer;
    const guildId = player?.guildId || maybeGuildData?.guildId;
    const guildData = maybeGuildData || (guildId ? getGuildMusicData(guildId) : null);

    const requester = track?.info?.requester || track?.requester;
    const requesterLabel = requester
        ? (requester.username || requester.tag || 'Unknown')
        : 'Unknown';

    const position = formatDuration(player?.position || 0);
    const duration = formatDuration(track?.info?.length || track?.length || 0);
    const sourceLabel = detectTrackSource(track);
    const volumeValue = guildData?.volume ?? player?.volume ?? 75;
    const loopMode = guildData?.loop ?? player?.loop ?? 'none';

    return createEmbed({
        title: 'Now Playing',
        description: formatTrackTitle(track),
        color: 'primary',
        fields: [
            { name: 'Artist', value: track?.info?.author || track?.author || 'Unknown', inline: true },
            { name: 'Source', value: sourceLabel, inline: true },
            { name: 'Requester', value: requesterLabel, inline: true },
            { name: 'Progress', value: `${position} / ${duration}`, inline: true },
            { name: 'Volume', value: `${volumeValue}%`, inline: true },
            { name: 'Loop', value: getLoopLabel(loopMode), inline: true },
            { name: 'Queue', value: `${player?.queue?.length || 0} track(s)`, inline: true },
        ],
        thumbnail: getTrackArtwork(track),
        footer: player?.paused ? 'Paused' : 'Playing',
    });
}

export function buildQueueEmbed(queueOrPlayer, currentOrPage = 0, maybePageSize = QUEUE_PAGE_SIZE) {
    const isPlayerArg = Boolean(queueOrPlayer?.queue && !Array.isArray(queueOrPlayer?.queue));
    const player = isPlayerArg ? queueOrPlayer : null;
    const queue = isPlayerArg ? player.queue : queueOrPlayer;
    const currentTrack = isPlayerArg ? player.current : currentOrPage;
    const rawPage = isPlayerArg ? Number(currentOrPage || 1) - 1 : Number(maybePageSize || 0);

    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(rawPage, 0), totalPages - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = typeof queue?.slice === 'function' ? queue.slice(start, start + QUEUE_PAGE_SIZE) : [];

    let description = '';
    if (currentTrack) {
        const currentSource = detectTrackSource(currentTrack);
        const currentDuration = formatDuration(currentTrack.info?.length || currentTrack.length || 0);
        description += `**Now Playing**\n${formatTrackTitle(currentTrack)} — ${currentTrack.info?.author || currentTrack.author || 'Unknown'} \`[${currentDuration}]\` • *${currentSource}*\n\n`;
    }

    if (slice.length === 0) {
        description += 'The queue is empty.';
    } else {
        description += slice
            .map((track, index) => {
                const num = start + index + 1;
                const source = detectTrackSource(track);
                const duration = formatDuration(track.info?.length || track.length || 0);
                return `${num}. ${formatTrackTitle(track)} — ${track.info?.author || track.author || 'Unknown'} \`[${duration}]\` • *${source}*`;
            })
            .join('\n');
    }

    return createEmbed({
        title: 'Music Queue',
        description: description.substring(0, 4096),
        color: 'info',
        footer: `Page ${safePage + 1} of ${totalPages} • ${totalTracks} queued`,
    });
}

export function buildPlayerButtonRows(player, guildData) {
    const paused = Boolean(player?.paused);
    const loopMode = guildData?.loop ?? player?.loop ?? 'none';
    const isLoopActive = Boolean(loopMode && loopMode !== 'none');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Pause')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
            .setDisabled(paused),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Resume')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(!paused),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Shuffle')
            .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔀'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel('Loop')
            .setStyle(isLoopActive ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔁'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Vol -')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔉'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Vol +')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    return [row1, row2];
}

export function buildQueuePaginationRow(pageOrPlayer, totalPagesOrPage = 1, maybePageSize = QUEUE_PAGE_SIZE) {
    if (pageOrPlayer && typeof pageOrPlayer === 'object' && pageOrPlayer.queue) {
        const totalTracks = pageOrPlayer.queue.length || 0;
        const totalPages = Math.max(1, Math.ceil(totalTracks / maybePageSize));
        const currentPage = Math.min(Math.max(Number(totalPagesOrPage) || 1, 1), totalPages);
        return getPaginationRow('music_queue', currentPage, totalPages);
    }
    return getPaginationRow('music_queue', Number(pageOrPlayer) + 1, Number(totalPagesOrPage) || 1);
}

export function getQueuePageSize() {
    return QUEUE_PAGE_SIZE;
}
