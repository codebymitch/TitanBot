// ccService.js — every change to a member's Chaos Credits goes through here.
//
// CC lives in the member's economy record (`guild:<id>:economy:<user>`) next to the old, now unused
// wallet/bank fields:
//   cc          current balance
//   ccStats     { earned, spent, gamesPlayed, podiums, groupWins, soloWins }
//   ccSolo      { day: 'YYYY-MM-DD', earned } — solo game CC earned today, for the daily cap
//   ccInventory { itemId: quantity } — reserved for the store (see ccStoreService.js)
//   ccGamesBot  { day: 'YYYY-MM-DD', earned } — CC from games bot wins today, for its daily cap
//   ccTransfers [timestamp] — when the member sent CC with `give` in the last 7 days, for the transfer tax

import { CC, ccBoost, gamesBotDailyCap, gamesBotReward, soloDailyCap } from '../../config/cc.js';
import { getEconomyKey, getEconomyPrefix } from '../../utils/database.js';
import { normalizeEconomyData } from '../../utils/schemas.js';
import { DEFAULT_ECONOMY_DATA } from '../../utils/constants.js';
import { Mutex } from '../../utils/mutex.js';
import { logger } from '../../utils/logger.js';

const EMPTY_STATS = { earned: 0, spent: 0, gamesPlayed: 0, podiums: 0, groupWins: 0, soloWins: 0, sent: 0, received: 0 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** CC for 1st, 2nd and 3rd place in a group game with `playerCount` players (with the CC event multiplier). */
export function groupRewards(playerCount, { now = Date.now() } = {}) {
    const players = Math.floor(Number(playerCount) || 0);
    if (players < 2) return [];
    const pool = Math.min(players, CC.group.maxCountedPlayers) * CC.group.perPlayer;
    // Fewer places than players, so a 2 player game can't pay both of them.
    const places = Math.min(CC.group.split.length, players - 1);
    const boost = ccBoost(now);
    return CC.group.split.slice(0, places).map((share) => Math.max(1, Math.round(pool * share)) * boost);
}

/** How much of a solo win is still allowed today, given what was already earned (the win follows the CC event, the cap is soloDailyCap). */
export function soloRewardLeft(alreadyEarnedToday, { now = Date.now() } = {}) {
    return Math.max(0, Math.min(CC.solo.win * ccBoost(now), soloDailyCap(now) - (alreadyEarnedToday || 0)));
}

export function utcDay(now = Date.now()) {
    return new Date(now).toISOString().slice(0, 10);
}

export function readCC(record = {}) {
    return {
        cc: Number.isSafeInteger(record.cc) && record.cc > 0 ? record.cc : 0,
        stats: { ...EMPTY_STATS, ...(record.ccStats || {}) },
        inventory: { ...(record.ccInventory || {}) },
    };
}

async function loadRecord(client, guildId, userId) {
    if (!client?.db?.get) throw new Error('Database not available');
    // Unlike getEconomyData this throws on a read error, so a failed read is never written back as an empty record.
    const raw = await client.db.get(getEconomyKey(guildId, userId), {});
    return normalizeEconomyData(raw, DEFAULT_ECONOMY_DATA);
}

async function saveRecord(client, guildId, userId, record) {
    const saved = await client.db.set(getEconomyKey(guildId, userId), record);
    if (saved === false) throw new Error('Failed to save CC');
}

/** Loads the member's record, lets `change` edit it and saves it, one change per member at a time. */
async function updateRecord(client, guildId, userId, change) {
    return Mutex.runExclusive(`cc:${guildId}:${userId}`, async () => {
        const record = await loadRecord(client, guildId, userId);
        const state = readCC(record);
        const result = change(state, record);
        if (result?.skipSave) return result;
        record.cc = state.cc;
        record.ccStats = state.stats;
        record.ccInventory = state.inventory;
        await saveRecord(client, guildId, userId, record);
        return { ...result, balance: state.cc, stats: state.stats };
    });
}

function credit(state, amount) {
    const next = state.cc + amount;
    if (!Number.isSafeInteger(next)) throw new Error('CC balance overflow');
    state.cc = next;
    state.stats.earned += amount;
}

export async function getProfile(client, guildId, userId) {
    return readCC(await loadRecord(client, guildId, userId));
}

/**
 * Pays a finished group game. `ranking` is the finishing order (user IDs, 1st first); only the top
 * places get CC. Every player in `playerIds` gets a game counted in their stats.
 */
export async function awardGroupGame(client, guildId, { game, ranking, playerIds, now = Date.now() }) {
    const rewards = groupRewards(playerIds.length, { now });
    const winners = ranking.slice(0, rewards.length).map((userId, index) => ({ userId, place: index + 1, amount: rewards[index] }));
    const winnerIds = new Set(winners.map((w) => w.userId));

    const paid = [];
    for (const winner of winners) {
        try {
            const result = await updateRecord(client, guildId, winner.userId, (state) => {
                credit(state, winner.amount);
                state.stats.gamesPlayed += 1;
                state.stats.podiums += 1;
                if (winner.place === 1) state.stats.groupWins += 1;
            });
            paid.push({ ...winner, balance: result.balance });
        } catch (error) {
            logger.error(`[CC] Failed to pay ${winner.userId} for ${game}`, error);
        }
    }
    await Promise.all(playerIds.filter((id) => !winnerIds.has(id)).map((userId) => updateRecord(client, guildId, userId, (state) => {
        state.stats.gamesPlayed += 1;
    }).catch((error) => logger.warn(`[CC] Failed to count ${game} for ${userId}: ${error.message}`))));

    logger.info('[CC] Group game paid', { guildId, game, players: playerIds.length, winners: paid.map((w) => `${w.userId}:${w.amount}`) });
    return paid;
}

/** Pays a solo game win, up to the daily solo cap. Returns `{ amount, capped }`. */
export async function awardSoloWin(client, guildId, userId, game, { now = Date.now() } = {}) {
    try {
        return await updateRecord(client, guildId, userId, (state, record) => {
            const today = utcDay(now);
            const solo = record.ccSolo?.day === today ? record.ccSolo : { day: today, earned: 0 };
            const amount = soloRewardLeft(solo.earned, { now });
            state.stats.soloWins += 1;
            if (amount > 0) credit(state, amount);
            record.ccSolo = { day: today, earned: solo.earned + amount };
            return { amount, capped: amount < CC.solo.win * ccBoost(now), game };
        });
    } catch (error) {
        logger.error(`[CC] Failed to pay solo ${game} win for ${userId}`, error);
        return { amount: 0, capped: false, failed: true };
    }
}

/**
 * Pays a win announced by the games bot, up to today's cap (gamesBotDailyCap: 5000 during the CC event, none after). `kind` is 'group' for a
 * group game win or 'answer' for a solo first-to-answer win (amounts: gamesBotReward in config/cc.js).
 * Returns `{ amount, capped, balance }`; `amount` is 0 once the cap is reached (the win is still counted).
 */
export async function awardGamesBotWin(client, guildId, userId, { now = Date.now(), kind = 'group' } = {}) {
    return updateRecord(client, guildId, userId, (state, record) => {
        const today = utcDay(now);
        const earned = record.ccGamesBot?.day === today ? record.ccGamesBot.earned : 0;
        const boost = ccBoost(now);
        const base = gamesBotReward(kind, guildId);
        const amount = Math.max(0, Math.min(base * boost, gamesBotDailyCap(now) - earned));
        if (amount > 0) credit(state, amount);
        state.stats.gamesPlayed += 1;
        if (kind === 'answer') {
            state.stats.soloWins += 1;
        } else {
            state.stats.podiums += 1;
            state.stats.groupWins += 1;
        }
        record.ccGamesBot = { day: today, earned: earned + amount };
        return { amount, capped: amount < base * boost, boost };
    });
}

/** CC for reaching each level in (fromLevel, toLevel]: CC.levelUp.perLevel × level, with the CC event multiplier. */
export function levelUpReward(fromLevel, toLevel, { now = Date.now() } = {}) {
    let total = 0;
    for (let level = fromLevel + 1; level <= toLevel; level += 1) total += level * CC.levelUp.perLevel;
    return total * ccBoost(now);
}

/** Pays a member for leveling up from `fromLevel` to `toLevel`. Returns `{ amount, balance, boost }`. */
export async function awardLevelUp(client, guildId, userId, fromLevel, toLevel, { now = Date.now() } = {}) {
    const amount = levelUpReward(fromLevel, toLevel, { now });
    if (amount <= 0) return { amount: 0, boost: ccBoost(now) };
    const result = await updateRecord(client, guildId, userId, (state) => {
        credit(state, amount);
        return { amount };
    });
    logger.info('[CC] Level-up paid', { guildId, userId, fromLevel, toLevel, amount });
    return { amount, balance: result.balance, boost: ccBoost(now) };
}

/** Gives CC outside the reward rules above (the games bot, via ccApi.js). */
export async function grantCC(client, guildId, userId, amount, { source = 'unknown', reason = '' } = {}) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid CC amount');
    return updateRecord(client, guildId, userId, (state) => {
        credit(state, amount);
        logger.info('[CC] Granted', { guildId, userId, amount, source, reason });
        return { ok: true, amount };
    });
}

/** Takes CC away (store purchases). Returns `{ ok: false, balance }` when the member can't afford it. */
export async function spendCC(client, guildId, userId, amount, reason = 'unknown') {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid CC amount');
    return updateRecord(client, guildId, userId, (state) => {
        if (state.cc < amount) return { ok: false, skipSave: true, balance: state.cc };
        state.cc -= amount;
        state.stats.spent += amount;
        logger.info('[CC] Spent', { guildId, userId, amount, reason });
        return { ok: true };
    });
}

/** The transfer tax in percent when the sender already sent `sentThisWeek` times in the last 7 days. */
export function transferTaxPercent(sentThisWeek) {
    const { taxPercent, cheapPerWeek, extraPercentPerTransfer, maxTaxPercent } = CC.transfer;
    const extra = Math.max(0, sentThisWeek + 1 - cheapPerWeek) * extraPercentPerTransfer;
    return Math.min(maxTaxPercent, taxPercent + extra);
}

/** The tax on `amount` at `percent`, rounded up, and at least 1 CC when there is a tax. */
export function transferTax(amount, percent) {
    return percent > 0 ? Math.max(1, Math.ceil((amount * percent) / 100)) : 0;
}

function recentTransfers(record, now) {
    return (Array.isArray(record.ccTransfers) ? record.ccTransfers : []).filter((time) => Number.isFinite(time) && now - time < WEEK_MS);
}

/**
 * `give`: sends `amount` CC from one member to another. The sender pays `amount` and the receiver gets
 * it minus the tax (see CC.transfer). Returns `{ ok: true, amount, tax, taxPercent, received, balance,
 * nextTaxPercent }` or `{ ok: false, reason }` with reason one of: self, bad_amount, no_cc (with `balance`).
 */
export async function transferCC(client, guildId, fromId, toId, amount, { now = Date.now() } = {}) {
    if (fromId === toId) return { ok: false, reason: 'self' };
    if (!Number.isSafeInteger(amount) || amount < CC.transfer.minAmount) return { ok: false, reason: 'bad_amount' };

    const sent = await updateRecord(client, guildId, fromId, (state, record) => {
        if (state.cc < amount) return { ok: false, reason: 'no_cc', skipSave: true, balance: state.cc };
        const recent = recentTransfers(record, now);
        const taxPercent = transferTaxPercent(recent.length);
        state.cc -= amount;
        state.stats.sent += amount;
        record.ccTransfers = [...recent, now];
        return { ok: true, taxPercent, tax: transferTax(amount, taxPercent), nextTaxPercent: transferTaxPercent(recent.length + 1) };
    });
    if (!sent.ok) return sent;

    const received = amount - sent.tax;
    try {
        await updateRecord(client, guildId, toId, (state) => {
            const next = state.cc + received;
            if (!Number.isSafeInteger(next)) throw new Error('CC balance overflow');
            state.cc = next;
            state.stats.received += received;
        });
    } catch (error) {
        // The receiver couldn't be paid: give the sender everything back and don't count the transfer.
        await updateRecord(client, guildId, fromId, (state, record) => {
            state.cc += amount;
            state.stats.sent -= amount;
            record.ccTransfers = recentTransfers(record, now).filter((time) => time !== now);
        }).catch((refundError) => logger.error(`[CC] Failed to refund transfer from ${fromId}`, refundError));
        throw error;
    }

    logger.info('[CC] Transfer', { guildId, fromId, toId, amount, tax: sent.tax, taxPercent: sent.taxPercent });
    return { ok: true, amount, tax: sent.tax, taxPercent: sent.taxPercent, received, balance: sent.balance, nextTaxPercent: sent.nextTaxPercent };
}

/** Staff correction from the economy dashboard: adds (positive) or removes (negative) CC. */
export async function adjustCC(client, guildId, userId, delta, staffId) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Invalid CC amount');
    return updateRecord(client, guildId, userId, (state) => {
        state.cc = Math.max(0, state.cc + delta);
        logger.info('[CC] Staff adjustment', { guildId, userId, delta, staffId });
        return { ok: true };
    });
}

/** Store helper: runs `change(state)` on the member's CC state inside the same lock as payments. */
export async function updateCCState(client, guildId, userId, change) {
    return updateRecord(client, guildId, userId, (state, record) => change(state, record));
}

/** Everyone in the guild with CC, richest first. */
export async function getLeaderboard(client, guildId) {
    const prefix = getEconomyPrefix(guildId);
    const keys = await client.db.list(prefix);
    const rows = [];
    for (const key of Array.isArray(keys) ? keys : []) {
        const record = await client.db.get(key, null);
        const { cc, stats } = readCC(record || {});
        if (cc > 0) rows.push({ userId: key.slice(prefix.length), cc, earned: stats.earned });
    }
    return rows.sort((a, b) => b.cc - a.cc || b.earned - a.earned);
}
