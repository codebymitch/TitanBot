// Per-guild music session state (in-memory). Adapted from Musicify playerStore (Apache-2.0).

const DEFAULT_VOLUME = 75;
const DEFAULT_LOOP_MODE = 'none';

export class GuildMusicData {
    constructor() {
        this.playerMessageId = null;
        this.playerChannelId = null;
        this.autoplay = false;
        this.loop = DEFAULT_LOOP_MODE;
        this.volume = DEFAULT_VOLUME;
        this.shuffle = false;
        this.previousTracks = [];
        this.twentyFourSeven = false;
        this.queuePages = new Map();
        this.updateInterval = null;
        this.idleTimeout = null;
        this.autoPaused = false;
        this.stopConfirmPending = null;
    }

    resetSession() {
        clearTimers(this);
        this.playerMessageId = null;
        this.playerChannelId = null;
        this.shuffle = false;
        this.previousTracks = [];
        this.queuePages?.clear();
        this.autoPaused = false;
        this.stopConfirmPending = null;
    }
}

export function clearUpdateInterval(guildData) {
    if (!guildData?.updateInterval) {
        return;
    }
    clearInterval(guildData.updateInterval);
    guildData.updateInterval = null;
}

export function clearIdleTimeout(guildData) {
    if (!guildData?.idleTimeout) {
        return;
    }
    clearTimeout(guildData.idleTimeout);
    guildData.idleTimeout = null;
}

function clearTimers(guildData) {
    clearUpdateInterval(guildData);
    clearIdleTimeout(guildData);
}

const guildStore = new Map();

export function getGuildMusicData(guildId) {
    if (!guildId) {
        return new GuildMusicData();
    }

    if (!guildStore.has(guildId)) {
        guildStore.set(guildId, new GuildMusicData());
    }
    return guildStore.get(guildId);
}

export function deleteGuildMusicData(guildId) {
    if (!guildId) {
        return;
    }

    const guildData = guildStore.get(guildId);
    if (guildData) {
        clearTimers(guildData);
    }
    guildStore.delete(guildId);
}
