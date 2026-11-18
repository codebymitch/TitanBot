// Tracks potion uses so they can be reversed later (button undo + /undo).
// History entries look like { itemId, amount, remaining, at }.

import { getItemById } from '../config/shop/items.js';

export const DEFAULT_LUCK_POTION_DURATION_MS = 5 * 60 * 1000;

const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_MAX_ENTRIES = 200;

function getHistory(userData) {
    return Array.isArray(userData?.potionUseHistory) ? userData.potionUseHistory : [];
}

function pruneHistory(entries, now) {
    const cutoff = now - HISTORY_MAX_AGE_MS;
    return entries
        .filter((entry) => entry && Number(entry.at) > cutoff && Number(entry.remaining) > 0)
        .slice(-HISTORY_MAX_ENTRIES);
}

export function recordPotionUse(userData, itemId, amount, now = Date.now()) {
    const entries = getHistory(userData).slice();
    entries.push({ itemId, amount, remaining: amount, at: now });
    userData.potionUseHistory = pruneHistory(entries, now);
}

export function getUndoableAmount(userData, itemId, now = Date.now()) {
    const cutoff = now - HISTORY_MAX_AGE_MS;
    return getHistory(userData)
        .filter((entry) => entry?.itemId === itemId && Number(entry.remaining) > 0 && Number(entry.at) > cutoff)
        .reduce((total, entry) => total + Number(entry.remaining), 0);
}

export function undoPotionUse(userData, itemId, requestedAmount, now = Date.now()) {
    const item = getItemById(itemId);
    if (!item || item.effect?.type !== 'fishing_luck') {
        return { ok: false, reason: 'not_undoable' };
    }

    const requested = Math.max(1, Math.floor(Number(requestedAmount) || 1));
    const entries = getHistory(userData);
    const cutoff = now - HISTORY_MAX_AGE_MS;

    let refunded = 0;
    for (let i = entries.length - 1; i >= 0 && refunded < requested; i -= 1) {
        const entry = entries[i];
        if (!entry || entry.itemId !== itemId) continue;

        const remaining = Number(entry.remaining);
        if (remaining <= 0 || Number(entry.at) <= cutoff) continue;

        const take = Math.min(remaining, requested - refunded);
        entry.remaining = remaining - take;
        refunded += take;
    }

    if (refunded <= 0) {
        return { ok: false, reason: 'nothing_to_undo' };
    }

    const inventory = userData.inventory || {};
    inventory[itemId] = (Number(inventory[itemId]) || 0) + refunded;
    userData.inventory = inventory;

    const durationPerUse = Number(item.effect?.duration) || DEFAULT_LUCK_POTION_DURATION_MS;
    const removedMs = durationPerUse * refunded;
    const potionExpiries = userData.luckPotionExpiresAt || {};
    const currentExpiry = Number(potionExpiries[itemId]) || 0;
    const newExpiry = currentExpiry - removedMs;

    if (newExpiry > now) {
        potionExpiries[itemId] = newExpiry;
    } else {
        delete potionExpiries[itemId];
    }
    userData.luckPotionExpiresAt = potionExpiries;

    userData.potionUseHistory = pruneHistory(entries, now);

    return { ok: true, refunded, removedMs };
}
