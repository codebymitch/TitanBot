import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { EmbedBuilder, User } from 'discord.js';
import type { Player, Track } from 'riffy';
import { createEmbed } from '../../utils/embeds.js';
import { getPaginationRow } from '../../utils/components.js';
import type { GuildMusicData } from './playerStore.js';

/** Track info fields read here that riffy's typings do not declare (absent on most nodes). */
export type MusicTrackInfo = Track['info'] & {
    artworkUrl?: string | null;
    isStream?: boolean;
    isSeekable?: boolean;
};

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

export function formatDuration(ms: number): string {
    if (!ms || Number.isNaN(ms)) {
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

function getTrackArtwork(track: Track | null | undefined): string | null {
    const info = track?.info as MusicTrackInfo | undefined;
    return info?.artworkUrl || info?.thumbnail || null;
}

function getLoopLabel(loop: string | undefined): string {
    switch (loop) {
        case 'track':
            return 'Titel';
        case 'queue':
            return 'Warteschlange';
        default:
            return 'Aus';
    }
}

export function buildNowPlayingEmbed(
    track: Track | null | undefined,
    player: Player | null | undefined,
    guildData: GuildMusicData | null | undefined,
): EmbedBuilder {
    const requester = track?.info?.requester as Partial<Pick<User, 'username' | 'tag'>> | null | undefined;
    const requesterLabel = requester
        ? (requester.username || requester.tag || 'Unbekannt')
        : 'Unbekannt';

    const position = formatDuration(player?.position || 0);
    const duration = formatDuration(track?.info?.length || 0);

    return createEmbed({
        title: 'Läuft gerade',
        description: track?.info?.title || 'Unbekannter Titel',
        color: 'primary',
        fields: [
            { name: 'Interpret', value: track?.info?.author || 'Unbekannt', inline: true },
            { name: 'Angefragt von', value: requesterLabel, inline: true },
            { name: 'Fortschritt', value: `${position} / ${duration}`, inline: true },
            { name: 'Lautstärke', value: `${guildData?.volume ?? 75}%`, inline: true },
            { name: 'Wiederholen', value: getLoopLabel(guildData?.loop), inline: true },
            { name: 'Warteschlange', value: `${player?.queue?.length || 0} Titel`, inline: true },
        ],
        thumbnail: getTrackArtwork(track),
        footer: player?.paused ? 'Pausiert' : 'Läuft',
    });
}

export function buildQueueEmbed(queue: Track[] | null | undefined, currentTrack: Track | null | undefined, page = 0): EmbedBuilder {
    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = queue?.slice(start, start + QUEUE_PAGE_SIZE) || [];

    let description = '';
    if (currentTrack) {
        description += `**Läuft gerade**\n${currentTrack.info?.title || 'Unbekannt'} — ${currentTrack.info?.author || 'Unbekannt'}\n\n`;
    }

    if (slice.length === 0) {
        description += 'Die Warteschlange ist leer.';
    } else {
        description += slice
            .map((track, index) => {
                const num = start + index + 1;
                return `${num}. ${track.info?.title || 'Unbekannt'} — ${track.info?.author || 'Unbekannt'}`;
            })
            .join('\n');
    }

    return createEmbed({
        title: 'Musik-Warteschlange',
        description: description.substring(0, 4096),
        color: 'info',
        footer: `Seite ${safePage + 1} von ${totalPages} • ${totalTracks} in der Warteschlange`,
    });
}

export function buildPlayerButtonRows(player: Player | null | undefined, guildData: GuildMusicData | null | undefined): ActionRowBuilder<ButtonBuilder>[] {
    const paused = player?.paused;
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Pausieren')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
            .setDisabled(Boolean(paused)),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Fortsetzen')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(!paused),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Überspringen')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Stoppen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Mischen')
            .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔀'),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel('Wiederholen')
            .setStyle(guildData?.loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔁'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Leiser')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔉'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Lauter')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Warteschlange')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    return [row1, row2];
}

export function buildQueuePaginationRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    return getPaginationRow('music_queue', page + 1, totalPages);
}

export function getQueuePageSize(): number {
    return QUEUE_PAGE_SIZE;
}
