// Map<guildId, snapshotData> — stored in memory until bot restarts
const snapshots = new Map();

export function storeNukeSnapshot(guildId, snapshot) {
    snapshots.set(guildId, snapshot);
}

export function getNukeSnapshot(guildId) {
    return snapshots.get(guildId) ?? null;
}

export async function saveServerSnapshot(guild) {
    await guild.members.fetch().catch(() => {});
    await guild.roles.fetch().catch(() => {});
    await guild.channels.fetch().catch(() => {});

    return {
        savedAt: new Date().toISOString(),
        server: {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            ownerId: guild.ownerId,
            memberCount: guild.memberCount,
        },
        roles: [...guild.roles.cache.values()]
            .filter(r => !r.managed && r.id !== guild.id)
            .sort((a, b) => a.position - b.position)
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                permissions: r.permissions.toArray(),
                position: r.position,
                hoist: r.hoist,
                mentionable: r.mentionable,
            })),
        channels: [...guild.channels.cache.values()]
            .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                parentId: c.parentId ?? null,
                position: c.rawPosition ?? 0,
                topic: c.topic ?? null,
                nsfw: c.nsfw ?? false,
                slowmode: c.rateLimitPerUser ?? 0,
            })),
        members: [...guild.members.cache.values()].map(m => ({
            id: m.id,
            tag: m.user.tag,
            nickname: m.nickname ?? null,
            roles: m.roles.cache.filter(r => r.id !== guild.id).map(r => r.id),
            joinedAt: m.joinedAt?.toISOString() ?? null,
        })),
    };
}
