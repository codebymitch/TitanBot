import { logger } from '../../utils/logger.js';

// Counts every message members send, for `top chat`. Counts are kept in memory and written to the
// database every 10 seconds and on shutdown (one key per server: { userId: count }), so chat doesn't cause a write per message.
const FLUSH_EVERY_MS = 10_000;
const pending = new Map(); // guildId -> Map<userId, count>
let flushTimer = null;

export const chatCountKey = (guildId) => `guild:${guildId}:chatcounts`;

export function countMessage(client, guildId, userId) {
    if (!pending.has(guildId)) pending.set(guildId, new Map());
    const counts = pending.get(guildId);
    counts.set(userId, (counts.get(userId) || 0) + 1);
    if (!flushTimer) {
        flushTimer = setInterval(() => flushChatCounts(client).catch((error) => logger.error('Failed to save chat counts:', error)), FLUSH_EVERY_MS);
        flushTimer.unref?.();
    }
}

/** Adds the counts collected in memory to the stored totals. */
export async function flushChatCounts(client) {
    for (const [guildId, counts] of pending) {
        if (!counts.size) continue;
        pending.set(guildId, new Map());
        const stored = (await client.db.get(chatCountKey(guildId), {})) || {};
        for (const [userId, count] of counts) stored[userId] = (stored[userId] || 0) + count;
        await client.db.set(chatCountKey(guildId), stored);
    }
}

/** Stored totals plus what hasn't been written yet. */
export async function getChatCounts(client, guildId) {
    const stored = { ...((await client.db.get(chatCountKey(guildId), {})) || {}) };
    for (const [userId, count] of pending.get(guildId) || []) stored[userId] = (stored[userId] || 0) + count;
    return stored;
}

/** The members with the most messages, highest first: [{ userId, messages, rank }]. */
export function rankChatCounts(counts, isMember = () => true) {
    return Object.entries(counts)
        .filter(([userId, messages]) => messages > 0 && isMember(userId))
        .sort((a, b) => b[1] - a[1])
        .map(([userId, messages], index) => ({ userId, messages, rank: index + 1 }));
}
