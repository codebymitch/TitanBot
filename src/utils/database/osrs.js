import { getOsrsLinkKey, getOsrsUsernameKey } from './keys.js';

const OSRS_USERNAME_REGEX = /^[a-z0-9 ]{1,12}$/i;

export function normalizeOsrsUsername(osrsUsername) {
    if (typeof osrsUsername !== 'string') {
        return null;
    }

    const normalized = osrsUsername.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
}

export function isValidOsrsUsername(osrsUsername) {
    return typeof osrsUsername === 'string' && OSRS_USERNAME_REGEX.test(osrsUsername);
}

export async function getOsrsLink(client, guildId, userId) {
    if (!client?.db?.get) {
        throw new Error('Database not available');
    }

    const key = getOsrsLinkKey(guildId, userId);
    return client.db.get(key, null);
}

export async function getOsrsLinkByUsername(client, guildId, osrsUsername) {
    if (!client?.db?.get) {
        throw new Error('Database not available');
    }

    const normalized = normalizeOsrsUsername(osrsUsername);
    if (!normalized) {
        return null;
    }

    const indexKey = getOsrsUsernameKey(guildId, normalized);
    const indexRecord = await client.db.get(indexKey, null);
    if (!indexRecord?.userId) {
        return null;
    }

    return getOsrsLink(client, guildId, indexRecord.userId);
}

export async function linkOsrsUsername(client, guildId, userId, osrsUsername) {
    if (!client?.db?.get || !client?.db?.set || !client?.db?.delete) {
        throw new Error('Database not available');
    }

    const normalized = normalizeOsrsUsername(osrsUsername);
    if (!normalized || !isValidOsrsUsername(normalized)) {
        throw new Error('OSRS usernames must be 1-12 characters using only letters, numbers, and spaces.');
    }

    const existingForUsername = await getOsrsLinkByUsername(client, guildId, normalized);
    if (existingForUsername && existingForUsername.userId !== userId) {
        throw new Error(`The OSRS username "${normalized}" is already linked in this server.`);
    }

    const existingUserLink = await getOsrsLink(client, guildId, userId);
    const existingNormalized = normalizeOsrsUsername(existingUserLink?.osrsUsername);
    if (existingNormalized && existingNormalized !== normalized) {
        await client.db.delete(getOsrsUsernameKey(guildId, existingUserLink.osrsUsername));
    }

    const record = {
        guildId,
        userId,
        osrsUsername: normalized,
        linkedAt: existingUserLink?.linkedAt || new Date().toISOString(),
    };

    await client.db.set(getOsrsLinkKey(guildId, userId), record);
    await client.db.set(getOsrsUsernameKey(guildId, normalized), {
        guildId,
        userId,
        osrsUsername: normalized,
    });

    return record;
}

export async function unlinkOsrsUsername(client, guildId, userId) {
    if (!client?.db?.get || !client?.db?.delete) {
        throw new Error('Database not available');
    }

    const existing = await getOsrsLink(client, guildId, userId);
    if (!existing) {
        return false;
    }

    await client.db.delete(getOsrsLinkKey(guildId, userId));
    await client.db.delete(getOsrsUsernameKey(guildId, existing.osrsUsername));
    return true;
}
