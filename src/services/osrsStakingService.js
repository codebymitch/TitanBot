import { addMoney, getEconomyData, removeMoney } from '../utils/economy.js';
import { logger } from '../utils/logger.js';
import {
    attachFightMessage,
    createFight,
    findOpenFightBetween,
    FIGHT_STATUSES,
    getActiveUserFights,
    getExpiredFights,
    getFight,
    payoutFightWinner,
    refundFight,
    saveFight,
    updateFightStatus,
} from '../utils/database/fights.js';
import { getApprovedOsrsLink, getOsrsLinkByUsername } from '../utils/database/osrs.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function ensurePositiveStake(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) {
        throw new Error('Fight stake must be a whole positive number of gp.');
    }
}

function isFightExpired(fight) {
    return Boolean(fight?.expiresAt) && new Date(fight.expiresAt).getTime() <= Date.now();
}

async function notifyUser(client, userId, content) {
    try {
        if (!client?.users?.fetch) {
            return;
        }

        const user = await client.users.fetch(userId);
        await user.send(content);
    } catch (error) {
        logger.warn('[OSRS_FIGHT] Failed to DM user', { userId, error: error.message });
    }
}

export async function findUserFight(client, guildId, userId, fightId = null, statuses = [FIGHT_STATUSES.PENDING, FIGHT_STATUSES.ACTIVE]) {
    if (fightId) {
        const fight = await getFight(client, fightId);
        if (!fight || fight.guildId !== guildId) {
            throw new Error('Fight not found.');
        }

        if (fight.challenger_id !== userId && fight.opponent_id !== userId) {
            throw new Error('You are not part of that fight.');
        }

        if (!statuses.includes(fight.status)) {
            throw new Error(`That fight is already ${fight.status}.`);
        }

        return fight;
    }

    const fights = (await getActiveUserFights(client, guildId, userId))
        .filter((fight) => statuses.includes(fight.status));

    if (fights.length === 0) {
        throw new Error('No matching fight was found.');
    }

    if (fights.length > 1) {
        throw new Error('You have multiple matching fights. Use the fight-id from /fight-status.');
    }

    return fights[0];
}

export async function handleFightChallenge(client, guildId, challengerId, opponentId, amount) {
    ensurePositiveStake(amount);

    if (challengerId === opponentId) {
        throw new Error('You cannot challenge yourself to a fight.');
    }

    const [challengerLink, opponentLink, challengerWallet, opponentWallet] = await Promise.all([
        getApprovedOsrsLink(client, guildId, challengerId),
        getApprovedOsrsLink(client, guildId, opponentId),
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);

    if (!challengerLink) {
        throw new Error('You need to link your OSRS username first with /link-osrs (requires admin approval).');
    }

    if (!opponentLink) {
        throw new Error('That member needs an approved linked OSRS username before they can fight.');
    }

    const existingFight = await findOpenFightBetween(client, guildId, challengerId, opponentId);
    if (existingFight) {
        if (isFightExpired(existingFight)) {
            if (existingFight.status === FIGHT_STATUSES.ACTIVE && existingFight.reported_winner) {
                await payoutFightWinner(client, existingFight.id, existingFight.reported_winner, {
                    source: 'report_timeout',
                    reported_winner: existingFight.reported_winner,
                });
            } else {
                await refundFight(client, existingFight.id);
            }
        } else {
            throw new Error('There is already a pending or active fight between these two members.');
        }
    }

    if ((challengerWallet?.wallet || 0) < amount) {
        throw new Error('You do not have enough gp in your wallet for that stake.');
    }

    if ((opponentWallet?.wallet || 0) < amount) {
        throw new Error('That member does not have enough gp in their wallet for that stake.');
    }

    const challengerRemoval = await removeMoney(client, guildId, challengerId, amount, 'wallet');
    if (!challengerRemoval?.success) {
        throw new Error(challengerRemoval?.error || 'Failed to escrow your stake.');
    }

    const opponentRemoval = await removeMoney(client, guildId, opponentId, amount, 'wallet');
    if (!opponentRemoval?.success) {
        await addMoney(client, guildId, challengerId, amount, 'wallet', { bypassLimits: true });
        throw new Error(opponentRemoval?.error || 'Failed to escrow the opponent stake.');
    }

    try {
        return await createFight(client, guildId, challengerId, opponentId, amount, {
            challengerOsrsUsername: challengerLink.osrsUsername,
            opponentOsrsUsername: opponentLink.osrsUsername,
        });
    } catch (error) {
        await Promise.allSettled([
            addMoney(client, guildId, challengerId, amount, 'wallet', { bypassLimits: true }),
            addMoney(client, guildId, opponentId, amount, 'wallet', { bypassLimits: true }),
        ]);
        throw error;
    }
}

export async function handleFightAccept(client, guildId, fightId, userId) {
    const fight = await findUserFight(client, guildId, userId, fightId, [FIGHT_STATUSES.PENDING]);

    if (fight.opponent_id !== userId) {
        throw new Error('Only the challenged member can accept this fight.');
    }

    if (isFightExpired(fight)) {
        await refundFight(client, fight.id);
        throw new Error('That fight challenge expired before it was accepted.');
    }

    return updateFightStatus(client, fight.id, FIGHT_STATUSES.ACTIVE, undefined, {
        acceptedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + FIVE_MINUTES_MS).toISOString(),
    });
}

export async function handleFightDecline(client, guildId, fightId, userId) {
    const fight = await findUserFight(client, guildId, userId, fightId, [FIGHT_STATUSES.PENDING]);

    if (fight.opponent_id !== userId && fight.challenger_id !== userId) {
        throw new Error('You cannot decline that fight.');
    }

    return refundFight(client, fight.id);
}

export async function handleFightReport(client, guildId, reporterId, winnerId, fightId = null) {
    const fight = await findUserFight(client, guildId, reporterId, fightId, [FIGHT_STATUSES.ACTIVE]);

    if (![fight.challenger_id, fight.opponent_id].includes(winnerId)) {
        throw new Error('The reported winner must be one of the two fighters.');
    }

    fight.reported_winner = winnerId;
    fight.reportedAt = new Date().toISOString();
    await saveFight(client, fight);

    if (isFightExpired(fight)) {
        return payoutFightWinner(client, fight.id, winnerId, {
            source: 'report_timeout',
            reported_winner: winnerId,
        });
    }

    return fight;
}

export async function handleFightResult(client, guildId, userId, confirmation, fightId = null) {
    if (confirmation !== 'accept' && confirmation !== 'decline') {
        throw new Error('Invalid confirmation. Use "accept" (you won) or "decline" (you lost).');
    }

    const fight = await findUserFight(client, guildId, userId, fightId, [FIGHT_STATUSES.ACTIVE]);

    if (isFightExpired(fight)) {
        const refunded = await refundFight(client, fight.id);
        throw new Error('That fight has expired. Both stakes have been refunded.');
    }

    const isChallenger = fight.challenger_id === userId;
    const confirmField = isChallenger ? 'challengerConfirmed' : 'opponentConfirmed';

    if (fight[confirmField] !== null) {
        throw new Error('You have already submitted your fight result confirmation.');
    }

    fight[confirmField] = confirmation;
    await saveFight(client, fight);

    const challengerConfirmed = fight.challengerConfirmed;
    const opponentConfirmed = fight.opponentConfirmed;

    if (challengerConfirmed === null || opponentConfirmed === null) {
        return { fight, outcome: 'waiting' };
    }

    if (challengerConfirmed === 'decline' && opponentConfirmed === 'decline') {
        const refunded = await refundFight(client, fight.id);
        return { fight: refunded, outcome: 'refunded' };
    }

    const challengerWon = challengerConfirmed === 'accept' && opponentConfirmed === 'decline';
    const opponentWon = challengerConfirmed === 'decline' && opponentConfirmed === 'accept';

    if (challengerWon || opponentWon) {
        const winnerId = challengerWon ? fight.challenger_id : fight.opponent_id;
        const resolved = await payoutFightWinner(client, fight.id, winnerId, {
            source: 'dual_confirmation',
        });
        return { fight: resolved, outcome: 'resolved', winnerId };
    }

    const disputed = await updateFightStatus(client, fight.id, FIGHT_STATUSES.TICKET_REQUIRED, null, {});
    return { fight: disputed, outcome: 'dispute' };
}

export async function resolveFightDispute(client, guildId, fightId, resolution, resolverId) {
    if (!['pay_challenger', 'pay_opponent', 'refund_both'].includes(resolution)) {
        throw new Error('Invalid dispute resolution.');
    }

    const fight = await getFight(client, fightId);
    if (!fight || fight.guildId !== guildId) {
        throw new Error('Fight not found.');
    }

    if (fight.status !== FIGHT_STATUSES.TICKET_REQUIRED) {
        throw new Error('That fight dispute has already been resolved.');
    }

    const disputeResolvedAt = new Date().toISOString();
    const metadata = {
        source: 'staff_dispute',
        disputeResolvedBy: resolverId,
        disputeResolvedAt,
    };

    if (resolution === 'refund_both') {
        return refundFight(client, fight.id, {
            ...metadata,
            disputeResolution: 'refund_both',
            challengerPayout: fight.amount,
            opponentPayout: fight.amount,
        });
    }

    const winnerId = resolution === 'pay_challenger' ? fight.challenger_id : fight.opponent_id;
    return payoutFightWinner(client, fight.id, winnerId, {
        ...metadata,
        disputeResolution: resolution,
        challengerPayout: resolution === 'pay_challenger' ? fight.amount * 2 : 0,
        opponentPayout: resolution === 'pay_opponent' ? fight.amount * 2 : 0,
    });
}

export async function resolveFightFromWebhook(client, guildId, killerName, victimName) {
    const [killerLink, victimLink] = await Promise.all([
        getOsrsLinkByUsername(client, guildId, killerName),
        getOsrsLinkByUsername(client, guildId, victimName),
    ]);

    if (!killerLink || !victimLink) {
        return null;
    }

    const fight = await findOpenFightBetween(client, guildId, killerLink.userId, victimLink.userId);
    if (!fight || fight.status !== FIGHT_STATUSES.ACTIVE) {
        return null;
    }

    const isKillerChallenger = fight.challenger_id === killerLink.userId;
    const killerConfirmField = isKillerChallenger ? 'challengerConfirmed' : 'opponentConfirmed';
    const victimConfirmField = isKillerChallenger ? 'opponentConfirmed' : 'challengerConfirmed';

    // Detect conflict: if the victim previously confirmed "accept" (claimed they won), that's a dispute
    if (fight[victimConfirmField] === 'accept') {
        fight[killerConfirmField] = 'accept';
        await saveFight(client, fight);
        const disputed = await updateFightStatus(client, fight.id, FIGHT_STATUSES.TICKET_REQUIRED, null, {});
        return { fight: disputed, outcome: 'dispute' };
    }

    // Auto-confirm killer as winner
    fight[killerConfirmField] = 'accept';
    await saveFight(client, fight);

    // If victim has already confirmed their loss, resolve immediately
    if (fight[victimConfirmField] === 'decline') {
        const resolved = await payoutFightWinner(client, fight.id, killerLink.userId, {
            source: 'webhook',
        });
        return { fight: resolved, outcome: 'resolved', winnerId: killerLink.userId };
    }

    // Otherwise, save webhook confirmation and wait for victim's confirmation
    return { fight, outcome: 'waiting' };
}

export async function expirePendingFights(client) {
    const expiredFights = await getExpiredFights(client);
    const results = [];

    for (const fight of expiredFights) {
        if (fight.status === FIGHT_STATUSES.TICKET_REQUIRED) {
            continue;
        }

        let resolvedFight = null;

        if (fight.status === FIGHT_STATUSES.ACTIVE && fight.reported_winner) {
            resolvedFight = await payoutFightWinner(client, fight.id, fight.reported_winner, {
                source: 'report_timeout',
                reported_winner: fight.reported_winner,
            });
            await Promise.allSettled([
                notifyUser(client, fight.challenger_id, `Your OSRS fight ${fight.id} was auto-resolved in favor of <@${fight.reported_winner}> after time expired.`),
                notifyUser(client, fight.opponent_id, `Your OSRS fight ${fight.id} was auto-resolved in favor of <@${fight.reported_winner}> after time expired.`),
            ]);
        } else {
            resolvedFight = await refundFight(client, fight.id);
            await Promise.allSettled([
                notifyUser(client, fight.challenger_id, `Your OSRS fight ${fight.id} expired and both stakes were refunded.`),
                notifyUser(client, fight.opponent_id, `Your OSRS fight ${fight.id} expired and both stakes were refunded.`),
            ]);
        }

        results.push(resolvedFight);
    }

    return results;
}

export async function saveFightMessage(client, fightId, channelId, messageId) {
    return attachFightMessage(client, fightId, channelId, messageId);
}
