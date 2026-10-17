import { logger } from '../logger.js';
import { db, getFromDb } from './wrapper.js';
import { getTicketCounterKey, getTicketKey } from './keys.js';

export { getTicketKey, getTicketCounterKey } from './keys.js';

/** Stored ticket record (`guild:{guildId}:ticket:{channelId}`). */
export interface TicketData {
    id: string;
    userId: string;
    guildId: string;
    createdAt: string;
    status: string;
    claimedBy: string | null;
    priority: string;
    reason?: string;
    claimedAt?: string | null;
    closedBy?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
    priorityUpdatedAt?: string;
    priorityUpdatedBy?: string;
    feedback?: {
        rating?: number;
        submittedAt?: string;
        comment?: string;
        commentSubmittedAt?: string;
    };
    [key: string]: unknown;
}

export interface GuildTicketStats {
    openCount: number;
    closedCount: number;
    avgCloseTimeMs: number | null;
    feedbackCount: number;
    avgRating: number | null;
}

export async function getTicketData(guildId: string, channelId: string): Promise<TicketData | null> {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    return await db.get<TicketData>(key);
}

export async function getOpenTicketCountForUser(guildId: string, userId: string): Promise<number> {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
            const { pgConfig } = await import('../../config/database/postgres.js');
            const result = await db.db.pool.query<{ count: number }>(
                `SELECT COUNT(*)::int AS count FROM ${pgConfig.tables.tickets}
                 WHERE guild_id = $1
                   AND data->>'userId' = $2
                   AND data->>'status' = 'open'`,
                [guildId, userId],
            );

            return Number(result.rows?.[0]?.count || 0);
        }

        if (typeof db.list === 'function') {
            const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
            let count = 0;

            for (const key of ticketKeys) {
                if (key.endsWith(':counter')) continue;
                const ticket = await getFromDb<TicketData>(key, null);
                if (ticket && ticket.userId === userId && ticket.status === 'open') {
                    count += 1;
                }
            }

            return count;
        }

        return 0;
    } catch (error) {
        logger.error(`Error counting open tickets for user ${userId} in guild ${guildId}:`, error);
        return 0;
    }
}

export async function saveTicketData(guildId: string, channelId: string, data: TicketData): Promise<void> {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.set(key, data);
}

export async function deleteTicketData(guildId: string, channelId: string): Promise<void> {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.delete(key);
}

export async function getTicketCounter(guildId: string): Promise<number> {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const counter = await db.get<number>(key);
    return counter || 0;
}

export async function incrementTicketCounter(guildId: string): Promise<string> {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const currentCounter = await getTicketCounter(guildId);
    const nextCounter = currentCounter + 1;

    await db.set(key, nextCounter);

    return nextCounter.toString().padStart(3, '0');
}

async function listGuildTickets(guildId: string): Promise<TicketData[]> {
    if (!db.initialized) {
        await db.initialize();
    }

    if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
        const { pgConfig } = await import('../../config/database/postgres.js');
        const result = await db.db.pool.query<{ data: TicketData | null }>(
            `SELECT data FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
            [guildId],
        );
        return result.rows.map((row) => row.data).filter((data): data is TicketData => Boolean(data));
    }

    if (typeof db.list !== 'function') {
        return [];
    }

    const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
    const tickets: TicketData[] = [];

    for (const key of ticketKeys) {
        if (key.endsWith(':counter')) continue;
        const ticket = await getFromDb<TicketData>(key, null);
        if (ticket) tickets.push(ticket);
    }

    return tickets;
}

export async function getGuildTicketStats(guildId: string): Promise<GuildTicketStats> {
    try {
        const tickets = await listGuildTickets(guildId);
        let openCount = 0;
        let closedCount = 0;
        let totalCloseMs = 0;
        let closeSamples = 0;
        let feedbackCount = 0;
        let ratingSum = 0;

        for (const ticket of tickets) {
            if (ticket.status === 'open') {
                openCount += 1;
            } else if (ticket.status === 'closed') {
                closedCount += 1;
                if (ticket.createdAt && ticket.closedAt) {
                    const duration = new Date(ticket.closedAt).getTime() - new Date(ticket.createdAt).getTime();
                    if (Number.isFinite(duration) && duration >= 0) {
                        totalCloseMs += duration;
                        closeSamples += 1;
                    }
                }
            }

            const rating = ticket.feedback?.rating;
            if (rating != null && Number.isFinite(Number(rating))) {
                feedbackCount += 1;
                ratingSum += Number(rating);
            }
        }

        return {
            openCount,
            closedCount,
            avgCloseTimeMs: closeSamples > 0 ? Math.round(totalCloseMs / closeSamples) : null,
            feedbackCount,
            avgRating: feedbackCount > 0 ? Math.round((ratingSum / feedbackCount) * 10) / 10 : null,
        };
    } catch (error) {
        logger.error(`Error computing ticket stats for guild ${guildId}:`, error);
        return {
            openCount: 0,
            closedCount: 0,
            avgCloseTimeMs: null,
            feedbackCount: 0,
            avgRating: null,
        };
    }
}
