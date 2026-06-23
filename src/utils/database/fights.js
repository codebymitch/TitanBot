import { addMoney } from '../economy.js';
import { getFightCounterKey, getFightKey } from './keys.js';

export const FIGHT_STATUSES = {
    PENDING: 'pending',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    TICKET_REQUIRED: 'ticket_required',
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function getFightIdParts(fightId) {
    if (typeof fightId !== 'string') {
        return null;
    }

    const separatorIndex = fightId.indexOf('_');
    if (separatorIndex <= 0) {
        return null;
    }

    return {
        guildId: fightId.slice(0, separatorIndex),
        sequence: fightId.slice(separatorIndex + 1),
    };
}

function fightPrefix(guildId) {
    return `guild:${guildId}:fights:`;
}

function withDefaults(record) {
    if (!record) {
        return null;
    }

    return {
        reported_winner: null,
        resolved_at: null,
        winner_id: null,
        messageId: null,
        channelId: null,
        challengerOsrsUsername: null,
        opponentOsrsUsername: null,
        challengerConfirmed: null,
        opponentConfirmed: null,
        ticketId: null,
        disputeResolution: null,
        disputeResolvedAt: null,
        disputeResolvedBy: null,
        challengerPayout: null,
        opponentPayout: null,
        resolutionSource: null,
        ...record,
    };
}

export async function createFight(client, guildId, challengerId, opponentId, amount, metadata = {}) {
    if (!client?.db?.increment || !client?.db?.set) {
        throw new Error('Database not available');
    }

    const sequence = await client.db.increment(getFightCounterKey(guildId), 1);
    const now = new Date();
    const fightId = `${guildId}_${sequence}`;
    const expiresAt = new Date(now.getTime() + FIVE_MINUTES_MS).toISOString();
    const record = withDefaults({
        id: fightId,
        guildId,
        challenger_id: challengerId,
        opponent_id: opponentId,
        amount,
        status: FIGHT_STATUSES.PENDING,
        createdAt: now.toISOString(),
        expiresAt,
        ...metadata,
    });

    await client.db.set(getFightKey(guildId, fightId), record);
    return record;
}

export async function getFight(client, fightId) {
    if (!client?.db?.get) {
        throw new Error('Database not available');
    }

    const parts = getFightIdParts(fightId);
    if (!parts) {
        return null;
    }

    return withDefaults(await client.db.get(getFightKey(parts.guildId, fightId), null));
}

export async function saveFight(client, fight) {
    if (!client?.db?.set) {
        throw new Error('Database not available');
    }

    const record = withDefaults(fight);
    await client.db.set(getFightKey(record.guildId, record.id), record);
    return record;
}

export async function listGuildFights(client, guildId) {
    if (!client?.db?.list || !client?.db?.get) {
        throw new Error('Database not available');
    }

    const keys = await client.db.list(fightPrefix(guildId));
    const fights = [];

    for (const key of keys) {
        if (key.endsWith(':counter')) {
            continue;
        }

        const fight = await client.db.get(key, null);
        if (fight?.id) {
            fights.push(withDefaults(fight));
        }
    }

    return fights.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getActiveUserFights(client, guildId, userId) {
    const fights = await listGuildFights(client, guildId);
    return fights.filter((fight) =>
        (fight.challenger_id === userId || fight.opponent_id === userId)
        && (fight.status === FIGHT_STATUSES.PENDING || fight.status === FIGHT_STATUSES.ACTIVE),
    );
}

export async function getUserFightHistory(client, guildId, userId, limit = 10) {
    const fights = await listGuildFights(client, guildId);
    return fights
        .filter((fight) =>
            (fight.challenger_id === userId || fight.opponent_id === userId)
            && (fight.status === FIGHT_STATUSES.COMPLETED || fight.status === FIGHT_STATUSES.CANCELLED),
        )
        .slice(0, limit);
}

export async function findOpenFightBetween(client, guildId, userAId, userBId) {
    const fights = await listGuildFights(client, guildId);
    return fights.find((fight) => {
        const samePair = (
            (fight.challenger_id === userAId && fight.opponent_id === userBId)
            || (fight.challenger_id === userBId && fight.opponent_id === userAId)
        );

        return samePair
            && (fight.status === FIGHT_STATUSES.PENDING || fight.status === FIGHT_STATUSES.ACTIVE);
    }) || null;
}

export async function updateFightStatus(client, fightId, status, winner = null, extra = {}) {
    const fight = await getFight(client, fightId);
    if (!fight) {
        return null;
    }

    const updated = {
        ...fight,
        ...extra,
        status,
    };

    if (winner !== undefined) {
        updated.reported_winner = winner;
    }

    if (status === FIGHT_STATUSES.COMPLETED || status === FIGHT_STATUSES.CANCELLED || status === FIGHT_STATUSES.TICKET_REQUIRED) {
        updated.resolved_at = extra.resolved_at || new Date().toISOString();
    }

    await saveFight(client, updated);
    return updated;
}

export async function attachFightMessage(client, fightId, channelId, messageId) {
    const fight = await getFight(client, fightId);
    if (!fight) {
        return null;
    }

    fight.channelId = channelId;
    fight.messageId = messageId;
    return saveFight(client, fight);
}

export async function getExpiredFights(client, now = new Date()) {
    const guildKeys = await client.db.list('guild:');
    const guildIds = [...new Set(guildKeys
        .map((key) => key.split(':')[1])
        .filter(Boolean))];
    const expired = [];

    for (const guildId of guildIds) {
        const fights = await listGuildFights(client, guildId);
        for (const fight of fights) {
            if (
                (fight.status === FIGHT_STATUSES.PENDING || fight.status === FIGHT_STATUSES.ACTIVE)
                && fight.expiresAt
                && new Date(fight.expiresAt).getTime() <= now.getTime()
            ) {
                expired.push(fight);
            }
        }
    }

    return expired.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
}

export async function refundFight(client, fightId, resolution = {}) {
    const fight = await getFight(client, fightId);
    if (!fight) {
        return null;
    }

    if (fight.fundsRefunded) {
        return fight;
    }

    await addMoney(client, fight.guildId, fight.challenger_id, fight.amount, 'wallet', { bypassLimits: true });
    await addMoney(client, fight.guildId, fight.opponent_id, fight.amount, 'wallet', { bypassLimits: true });

    fight.fundsRefunded = true;
    fight.status = FIGHT_STATUSES.CANCELLED;
    fight.resolved_at = resolution.disputeResolvedAt || new Date().toISOString();
    fight.resolutionSource = resolution.source || fight.resolutionSource || 'manual';
    fight.disputeResolution = resolution.disputeResolution || fight.disputeResolution;
    fight.disputeResolvedAt = resolution.disputeResolvedAt || fight.disputeResolvedAt;
    fight.disputeResolvedBy = resolution.disputeResolvedBy || fight.disputeResolvedBy;
    fight.challengerPayout = resolution.challengerPayout ?? fight.amount;
    fight.opponentPayout = resolution.opponentPayout ?? fight.amount;
    await saveFight(client, fight);
    return fight;
}

export async function payoutFightWinner(client, fightId, winnerId, resolution = {}) {
    const fight = await getFight(client, fightId);
    if (!fight) {
        return null;
    }

    if (fight.winner_id) {
        return fight;
    }

    await addMoney(client, fight.guildId, winnerId, fight.amount * 2, 'wallet', { bypassLimits: true });

    fight.winner_id = winnerId;
    fight.status = FIGHT_STATUSES.COMPLETED;
    fight.resolved_at = resolution.disputeResolvedAt || new Date().toISOString();
    fight.reported_winner = resolution.reported_winner ?? fight.reported_winner;
    fight.resolutionSource = resolution.source || fight.resolutionSource || 'manual';
    fight.disputeResolution = resolution.disputeResolution || fight.disputeResolution;
    fight.disputeResolvedAt = resolution.disputeResolvedAt || fight.disputeResolvedAt;
    fight.disputeResolvedBy = resolution.disputeResolvedBy || fight.disputeResolvedBy;
    fight.challengerPayout = resolution.challengerPayout ?? (winnerId === fight.challenger_id ? fight.amount * 2 : 0);
    fight.opponentPayout = resolution.opponentPayout ?? (winnerId === fight.opponent_id ? fight.amount * 2 : 0);
    await saveFight(client, fight);
    return fight;
}
