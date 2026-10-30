// cc.js — Chaos Credits (CC), the server's only currency.
//
// CC is earned from games only: wins in the games bot (Clover), and this bot's own games when they
// are switched back on (config/games.js). There is no `daily` any more; work, crime, rob, beg, fish,
// mine and gamble were removed on purpose too. Members can send CC to each other with `give`, which
// takes a tax that grows when someone sends a lot in a week (`transfer` below).

import { getColor } from './bot.js';
import { isHomeGuild } from './homeGuild.js';

export const CC = {
    name: 'Chaos Credits',
    short: 'CC',
    emoji: '🌀',

    group: {
        // The pool grows by this much for every player, up to `maxCountedPlayers` players.
        perPlayer: 10,
        maxCountedPlayers: 30,
        // How the pool is split between 1st, 2nd and 3rd place.
        split: [0.5, 0.3, 0.2],
    },

    solo: {
        // CC for winning a solo game (rps, xo, solo question, solo number, slots).
        win: 5,
        // Most CC a member can earn from solo games per day (UTC): `boostDailyCap` while the CC event runs
        // (a flat amount, not multiplied), `dailyCap` after it (null = no cap).
        boostDailyCap: 1500,
        dailyCap: null,
    },

    // Wins announced by the games bot (Clover), read from its messages (services/cc/gamesBotWins.js):
    // - a group game win, `👑 | @winner`, pays `win`;
    // - a solo win, `✅ | قام @member بكتابة الاجابة الصحيحة خلال ... ثانية` (first to type the answer), pays `answer`.
    // Its messages don't say how many played, so a win pays a fixed amount (times the CC event multiplier).
    // `win` / `answer` are for other servers (unchanged); our server pays `home` (report #181).
    gamesBot: {
        win: 50,
        answer: 10,
        home: { win: 500, answer: 50 },
        // Most CC a member can get from games bot wins per day (UTC), both kinds together: `boostDailyCap`
        // while the CC event runs (a flat amount, not multiplied), `dailyCap` after it (null = no cap).
        boostDailyCap: 5000,
        dailyCap: null,
    },

    // Leveling up (chat or voice XP) pays `perLevel × the new level`: level 1 = 10 CC, level 10 = 100,
    // level 50 = 500. Gaining several levels at once pays each of them. Staff changing levels by
    // command (leveladd / levelset) pays nothing.
    levelUp: {
        perLevel: 10,
    },

    // A limited-time event: every CC earned from games (group, solo, Clover wins and the games bot's
    // API rewards) and level-ups is multiplied until `until`, then it stops by itself. The daily caps are
    // not multiplied (see solo and gamesBot). Transfers and staff changes are never multiplied. Set
    // `multiplier: 1` to end it early.
    boost: {
        multiplier: 5,
        until: '2026-09-30T08:15:00Z',
    },

    // `give` / `تحويل`: sending CC to another member. The receiver gets the amount minus the tax.
    // The first `cheapPerWeek` transfers of the last 7 days pay `taxPercent`; each one after that pays
    // `extraPercentPerTransfer` more, up to `maxTaxPercent`. With these numbers: 5%, 5%, 5%, 10%, 15%, ... 50%.
    transfer: {
        minAmount: 10,
        taxPercent: 5,
        cheapPerWeek: 3,
        extraPercentPerTransfer: 5,
        maxTaxPercent: 50,
    },
};

/** The CC multiplier right now: CC.boost.multiplier while the event runs, otherwise 1. */
export function ccBoost(now = Date.now()) {
    const { multiplier, until } = CC.boost || {};
    const end = Date.parse(until);
    return Number.isInteger(multiplier) && multiplier > 1 && Number.isFinite(end) && now < end ? multiplier : 1;
}

/** Today's cap on CC from solo wins: `boostDailyCap` during the CC event, otherwise `dailyCap` (Infinity when null). */
export function soloDailyCap(now = Date.now()) {
    const cap = ccBoost(now) > 1 ? CC.solo.boostDailyCap : CC.solo.dailyCap;
    return Number.isFinite(cap) ? cap : Infinity;
}

/** `1,500 CC` for a daily cap, or `no cap` when there is none. */
export function capText(cap) {
    return Number.isFinite(cap) ? `${cap.toLocaleString('en-US')} ${CC.short}` : 'no cap';
}

/** CC for a games bot win in `guildId` before the event multiplier: `kind` 'group' (👑) or 'answer'. */
export function gamesBotReward(kind, guildId = null) {
    const amounts = isHomeGuild(guildId) ? CC.gamesBot.home : CC.gamesBot;
    return kind === 'answer' ? amounts.answer : amounts.win;
}

/** Today's cap on CC from games bot wins: `boostDailyCap` during the CC event, otherwise `dailyCap` (Infinity when null). */
export function gamesBotDailyCap(now = Date.now()) {
    const cap = ccBoost(now) > 1 ? CC.gamesBot.boostDailyCap : CC.gamesBot.dailyCap;
    return Number.isFinite(cap) ? cap : Infinity;
}

/** `🔥 CC ×5 — بيخلص in 4 days (date)` while the event runs, otherwise ''. Discord shows the time in each member's timezone. */
export function ccBoostLine(now = Date.now()) {
    const multiplier = ccBoost(now);
    if (multiplier === 1) return '';
    const end = Math.floor(Date.parse(CC.boost.until) / 1000);
    return `🔥 **CC ×${multiplier}** — بيخلص <t:${end}:R> (<t:${end}:f>)`;
}

/**
 * Embed for CC and game messages. A plain object (not an EmbedBuilder) so the emojis stay: the
 * EmbedBuilder helpers strip emojis, but the games need them (slot reels, medals, roles).
 */
export function ccEmbed(title, description = '', { fields = [], thumbnail = null, color = 'economy' } = {}) {
    return {
        color: getColor(color),
        title: String(title).slice(0, 256),
        ...(description ? { description: String(description).slice(0, 4096) } : {}),
        ...(fields.length ? { fields: fields.slice(0, 25) } : {}),
        ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
    };
}

export function formatCC(amount) {
    return `**${Number(amount || 0).toLocaleString('en-US')}** ${CC.emoji} ${CC.short}`;
}
