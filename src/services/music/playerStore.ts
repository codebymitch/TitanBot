// Per-guild music session state (in-memory). Adapted from Musicify playerStore (Apache-2.0).

import type { LoopOption, Track } from 'riffy';

export class GuildMusicData {
    playerMessageId: string | null;
    playerChannelId: string | null;
    autoplay: boolean;
    loop: LoopOption;
    volume: number;
    shuffle: boolean;
    previousTracks: Track[];
    twentyFourSeven: boolean;
    /** userId -> queue page currently shown to that user. */
    queuePages: Map<string, number>;
    updateInterval: ReturnType<typeof setInterval> | null;
    idleTimeout: ReturnType<typeof setTimeout> | null;
    autoPaused: boolean;
    /** userId of the member who has to confirm a large-queue stop. */
    stopConfirmPending: string | null;

    constructor() {
        this.playerMessageId = null;
        this.playerChannelId = null;
        this.autoplay = false;
        this.loop = 'none';
        this.volume = 75;
        this.shuffle = false;
        this.previousTracks = [];
        this.twentyFourSeven = false;
        this.queuePages = new Map();
        this.updateInterval = null;
        this.idleTimeout = null;
        this.autoPaused = false;
        this.stopConfirmPending = null;
    }
}

export function clearUpdateInterval(guildData: GuildMusicData): void {
    if (guildData.updateInterval) {
        clearInterval(guildData.updateInterval);
        guildData.updateInterval = null;
    }
}

const guildStore = new Map<string, GuildMusicData>();

export function getGuildMusicData(guildId: string): GuildMusicData {
    if (!guildStore.has(guildId)) {
        guildStore.set(guildId, new GuildMusicData());
    }
    return guildStore.get(guildId)!;
}

export function deleteGuildMusicData(guildId: string): void {
    const guildData = guildStore.get(guildId);
    if (guildData) {
        clearUpdateInterval(guildData);
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
        }
    }
    guildStore.delete(guildId);
}
