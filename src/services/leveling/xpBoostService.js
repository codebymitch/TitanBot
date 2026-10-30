// xpBoostService.js — XP ×2 boosts bought in the CC store (items of type 'boost' in
// src/config/store/ccStoreItems.js). A boost doubles the XP a member gets from chat and/or voice
// until a time; buying again while it runs adds the time on top. Read by addXp (xpSystem.js).
//
// Saved per guild at `guild:<id>:xpboosts`: `{ <userId>: { chat: until, voice: until } }` (ms), kept in
// memory after the first read because addXp asks on every XP award. Ended boosts are dropped on write.

import { getXpBoostsKey } from '../../utils/database/keys.js';
import { Mutex } from '../../utils/mutex.js';

export const BOOST_SOURCES = ['chat', 'voice'];
export const BOOST_MULTIPLIER = 2;

// guildId -> the saved boosts of that guild.
const cache = new Map();

async function loadBoosts(client, guildId) {
    if (cache.has(guildId)) return cache.get(guildId);
    const raw = await client.db.get(getXpBoostsKey(guildId), {});
    const boosts = raw && typeof raw === 'object' ? raw : {};
    cache.set(guildId, boosts);
    return boosts;
}

/** Drops the boosts that ended before `now`. */
export function pruneBoosts(boosts, now = Date.now()) {
    const kept = {};
    for (const [userId, entry] of Object.entries(boosts || {})) {
        const live = Object.fromEntries(BOOST_SOURCES.filter((source) => Number(entry?.[source]) > now).map((source) => [source, entry[source]]));
        if (Object.keys(live).length) kept[userId] = live;
    }
    return kept;
}

/** Adds `minutes` to the member's boost on each of `sources`, starting now or where the running boost ends. */
export function extendBoost(entry = {}, sources, minutes, now = Date.now()) {
    const next = { ...entry };
    for (const source of sources) {
        const from = Math.max(now, Number(entry[source]) || 0);
        next[source] = from + minutes * 60_000;
    }
    return next;
}

/** When the member's boosts end: `{ chat, voice }` (ms, 0 when there is none). */
export async function getXpBoosts(client, guildId, userId, now = Date.now()) {
    const entry = (await loadBoosts(client, guildId))[userId] || {};
    return Object.fromEntries(BOOST_SOURCES.map((source) => [source, Number(entry[source]) > now ? Number(entry[source]) : 0]));
}

/** The XP multiplier for `source` ('chat' or 'voice') right now: 2 while a boost runs, else 1. */
export async function xpBoostMultiplier(client, guildId, userId, source, now = Date.now()) {
    const until = (await getXpBoosts(client, guildId, userId, now))[source];
    return until > now ? BOOST_MULTIPLIER : 1;
}

/** Gives the member `minutes` of XP ×2 on `sources`. Returns when each boost now ends (`{ chat, voice }`). */
export async function addXpBoost(client, guildId, userId, sources, minutes, now = Date.now()) {
    return Mutex.runExclusive(`xpboosts:${guildId}`, async () => {
        const boosts = pruneBoosts(await loadBoosts(client, guildId), now);
        boosts[userId] = extendBoost(boosts[userId], sources, minutes, now);
        const saved = await client.db.set(getXpBoostsKey(guildId), boosts);
        if (saved === false) throw new Error('Failed to save the XP boost');
        cache.set(guildId, boosts);
        return getXpBoosts(client, guildId, userId, now);
    });
}

/** Forgets the cached boosts (tests). */
export function clearXpBoostCache() {
    cache.clear();
}
