// Map<guildId, snapshotData> — stored in memory until bot restarts
const snapshots = new Map();

export function storeNukeSnapshot(guildId, snapshot) {
    snapshots.set(guildId, snapshot);
}

export function getNukeSnapshot(guildId) {
    return snapshots.get(guildId) ?? null;
}
