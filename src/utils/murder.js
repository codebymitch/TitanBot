// Murder / kill-ranking system constants and helpers.
// Data is stored on the existing economy record (EconomyDataSchema uses
// .passthrough()), so no migration is required.

export const MURDER_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours
export const HOSPITAL_TIME = 30 * 60 * 1000;       // 30 minutes if you fail
export const MIN_VICTIM_WALLET = 250;              // target must be "worth it"
export const KILLSTREAK_BONUS_PCT = 0.05;          // +5% reward per active streak kill (capped)
export const KILLSTREAK_BONUS_CAP = 1.0;           // max +100% from streak

// Rank tiers - unlocked by murderXp. Each tier improves base success chance
// and payout multiplier. Lowest rank first.
export const MURDER_RANKS = [
    { name: 'Petty Thug',        minXp: 0,      baseSuccess: 0.30, payoutMult: 1.00, payoutMin: 150,  payoutMax: 600,   xpReward: 10 },
    { name: 'Street Hitman',     minXp: 100,    baseSuccess: 0.35, payoutMult: 1.15, payoutMin: 300,  payoutMax: 900,   xpReward: 15 },
    { name: 'Enforcer',          minXp: 300,    baseSuccess: 0.40, payoutMult: 1.30, payoutMin: 500,  payoutMax: 1500,  xpReward: 20 },
    { name: 'Assassin',          minXp: 750,    baseSuccess: 0.45, payoutMult: 1.50, payoutMin: 800,  payoutMax: 2500,  xpReward: 30 },
    { name: 'Cartel Boss',       minXp: 1500,   baseSuccess: 0.50, payoutMult: 1.75, payoutMin: 1200, payoutMax: 4000,  xpReward: 40 },
    { name: 'The Reaper',        minXp: 3000,   baseSuccess: 0.55, payoutMult: 2.00, payoutMin: 2000, payoutMax: 6500,  xpReward: 55 },
    { name: 'Legendary Killer',  minXp: 6000,   baseSuccess: 0.60, payoutMult: 2.50, payoutMin: 3500, payoutMax: 10000, xpReward: 75 },
];

/**
 * Return the rank object matching a given murderXp value.
 * @param {number} xp
 */
export function getRankForXp(xp = 0) {
    let current = MURDER_RANKS[0];
    for (const rank of MURDER_RANKS) {
        if (xp >= rank.minXp) {
            current = rank;
        } else {
            break;
        }
    }
    return current;
}

/**
 * Return the next rank object (or null if already at top).
 * @param {number} xp
 */
export function getNextRank(xp = 0) {
    const current = getRankForXp(xp);
    const idx = MURDER_RANKS.indexOf(current);
    if (idx === -1 || idx >= MURDER_RANKS.length - 1) return null;
    return MURDER_RANKS[idx + 1];
}

/**
 * Compute the actual success chance for an attacker vs. a victim.
 * Attacker rank gives base success. Victim's own rank slightly resists.
 * Streak adds a small bonus. Capped between 0.05 and 0.90 so neither side
 * is hopeless or guaranteed.
 */
export function calculateSuccessChance(attackerXp = 0, victimXp = 0, killStreak = 0) {
    const atk = getRankForXp(attackerXp);
    const vic = getRankForXp(victimXp);
    const attackerIdx = MURDER_RANKS.indexOf(atk);
    const victimIdx = MURDER_RANKS.indexOf(vic);
    const rankDelta = attackerIdx - victimIdx; // negative = attacker outranked
    const resistance = Math.max(0, victimIdx - attackerIdx) * 0.04;
    const streakBoost = Math.min(killStreak * 0.02, 0.15);
    const chance = atk.baseSuccess + (rankDelta > 0 ? rankDelta * 0.03 : 0) - resistance + streakBoost;
    return Math.min(0.90, Math.max(0.05, chance));
}

/**
 * Compute the dollar payout for a successful murder, including the
 * attacker rank's range, multiplier, and an active killstreak bonus.
 * Returns a positive integer.
 */
export function calculatePayout(attackerXp = 0, killStreak = 0) {
    const rank = getRankForXp(attackerXp);
    const base = Math.floor(Math.random() * (rank.payoutMax - rank.payoutMin + 1)) + rank.payoutMin;
    const withMult = Math.floor(base * rank.payoutMult);
    const streakMult = 1 + Math.min(killStreak * KILLSTREAK_BONUS_PCT, KILLSTREAK_BONUS_CAP);
    return Math.floor(withMult * streakMult);
}

/**
 * Ensure murder-related fields exist on a userData object. Mutates and returns.
 */
export function ensureMurderFields(userData) {
    if (!userData) return userData;
    if (typeof userData.kills !== 'number') userData.kills = 0;
    if (typeof userData.deaths !== 'number') userData.deaths = 0;
    if (typeof userData.murderXp !== 'number') userData.murderXp = 0;
    if (typeof userData.killStreak !== 'number') userData.killStreak = 0;
    if (typeof userData.bestKillStreak !== 'number') userData.bestKillStreak = 0;
    if (typeof userData.lastMurder !== 'number') userData.lastMurder = 0;
    if (typeof userData.hospitalizedUntil !== 'number') userData.hospitalizedUntil = 0;
    return userData;
}
