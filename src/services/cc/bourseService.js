// bourseService.js — the CC bourse: hourly prices, buying (`استثمار`) and selling (`بيع`).
// The assets and rules are src/config/store/bourse.js; the embeds are bourseUi.js.
//
// The market of a guild is saved at `guild:<id>:bourse`:
//   { hour, assets: { <assetId>: { price, previous, raise, roll, flow: { <userId>: net pieces this hour } } } }
// `hour` is the hour (hours since 1970, UTC) the prices belong to. The prices move lazily: whenever the
// market is read in a later hour, every missed hour is played in order, so no timer is needed and a
// restart changes nothing. A member's holdings are `ccBourse: { <assetId>: { qty, cost } }` in their
// economy record (`cost` is what they paid for the pieces they still have).
// `roll` is the random draw of the next hour's move, made in advance so the store's forecast
// (`forecastMarket`) can tell which way each asset goes; buying and selling during the hour still push it.
// Only in our server (src/config/homeGuild.js): other servers keep no `roll`, so their bourse works as before.
// `locked` is the next hour's price once someone bought the forecast (report #172): from then on that
// price is fixed, so later buying and selling can't make the forecast wrong. Only our server has it too.

import { bourseAssets, bourseSettings, findAsset } from '../../config/store/bourse.js';

export { findAsset };
import { getBourseKey, getEconomyKey, getEconomyPrefix } from '../../utils/database/keys.js';
import { Mutex } from '../../utils/mutex.js';
import { logger } from '../../utils/logger.js';
import { updateCCState, readCC } from './ccService.js';
import { isHomeGuild } from '../../config/homeGuild.js';

export const HOUR_MS = 60 * 60 * 1000;

export function hourOf(now = Date.now()) {
    return Math.floor(now / HOUR_MS);
}

/** When the prices change next (the start of the next hour), in ms. */
export function nextChangeAt(now = Date.now()) {
    return (hourOf(now) + 1) * HOUR_MS;
}

/** The assets of a guild: the palace (homeOnly) is in our server only. */
export function assetsFor(guildId) {
    return bourseAssets.filter((asset) => !asset.homeOnly || isHomeGuild(guildId));
}

/** Most pieces of `asset` a member can own: its own `maxOwned`, else maxOwnedPerAsset. */
export function maxOwnedOf(asset, settings = bourseSettings) {
    return asset?.maxOwned ?? settings.maxOwnedPerAsset;
}

/** The highest price an asset can reach right now: its `max`, lifted by demand (none for the palace). */
export function assetCeiling(asset, raise = 0) {
    if (!Number.isFinite(asset.max)) return Infinity;
    return Math.round(asset.max * (1 + Math.max(0, raise) / 100));
}

function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
}

/**
 * Keeps a price inside [low, high] without landing on a round limit: a price past a limit ends a
 * random step (up to 2% of the range) inside it, so prices always look random (1,325, not 2,000).
 */
export function keepInside(price, low, high, rng = Math.random) {
    const step = Math.max(1, Math.round((Number.isFinite(high) ? high - low : low) * 0.02));
    if (price >= high) return high - 1 - Math.floor(rng() * step);
    if (price <= low) return low + 1 + Math.floor(rng() * step);
    return price;
}

const isRoll = (value) => typeof value === 'number' && value >= 0 && value <= 1;

/** A new asset starts at a random price around `start` (up to its volatility away). */
function freshEntry(asset, rng = Math.random) {
    const price = keepInside(Math.round(asset.start * (1 + (rng() * 2 - 1) * asset.volatility)), asset.min, asset.max, rng);
    return { price, previous: price, raise: 0, roll: rng(), flow: {} };
}

/** Repairs a saved market (or makes a new one) so every asset has a valid entry. */
export function normalizeMarket(raw, { assets = bourseAssets, hour = hourOf(), rng = Math.random } = {}) {
    const market = {
        hour: Number.isSafeInteger(raw?.hour) ? raw.hour : hour,
        assets: {},
    };
    for (const asset of assets) {
        const saved = raw?.assets?.[asset.id];
        if (!saved || typeof saved !== 'object' || !Number.isSafeInteger(saved.price)) {
            market.assets[asset.id] = freshEntry(asset, rng);
            continue;
        }
        const raise = clamp(Number(saved.raise) || 0, 0, bourseSettings.demand.maxRaisePercent);
        // A price outside the range (after the range was changed in the config) is moved inside it.
        const price = keepInside(saved.price, asset.min, assetCeiling(asset, raise), rng);
        const roll = isRoll(saved.roll) ? saved.roll : rng();
        const entry = { price, previous: Number.isSafeInteger(saved.previous) ? saved.previous : price, raise, roll, flow: {} };
        if (Number.isSafeInteger(saved.locked) && saved.locked > 0) entry.locked = saved.locked;
        if (saved.flow && typeof saved.flow === 'object') {
            for (const [userId, net] of Object.entries(saved.flow)) {
                if (Number.isSafeInteger(net) && net !== 0) entry.flow[userId] = net;
            }
        }
        market.assets[asset.id] = entry;
    }
    return market;
}

/** The extra move (a fraction, e.g. 0.03) from the members who bought or sold `entry` this hour. */
export function demandMove(flow = {}, demand = bourseSettings.demand) {
    let buyers = 0;
    let sellers = 0;
    for (const net of Object.values(flow)) {
        if (net > 0) buyers += 1;
        else if (net < 0) sellers += 1;
    }
    const percent = clamp((buyers - sellers) * demand.perBuyerPercent, -demand.maxPercent, demand.maxPercent);
    return percent / 100;
}

/** Pieces of the asset bought during the hour, net of the ones sold (all members together). */
export function netUnits(flow = {}) {
    return Object.values(flow).reduce((total, net) => total + (Number.isSafeInteger(net) ? net : 0), 0);
}

/**
 * The sure rise when members bought at least `guaranteedRiseUnits` pieces in the hour: `perUnitPercent`
 * per piece, at most `maxMove`. 0 when fewer pieces were bought.
 */
export function guaranteedRise(flow, maxMove, demand = bourseSettings.demand) {
    const units = netUnits(flow);
    if (!demand.guaranteedRiseUnits || units < demand.guaranteedRiseUnits) return 0;
    return Math.min(maxMove, (units * demand.perUnitPercent) / 100);
}

/**
 * One hour of an asset: a random move of at most `maxMovePercent` (20%) up or down from the last
 * price. Near the top of its range the move leans down, near the bottom up, so it doesn't stick to a
 * limit; demand pushes it (each net buyer up by `demand.perBuyerPercent`, each net seller down). The
 * whole move, demand included, never goes past `maxMovePercent` in one hour. When members bought
 * 20+ pieces in the hour, the price rises for sure by `guaranteedRise` instead.
 */
export function tickAsset(asset, entry, { settings = bourseSettings, rng = Math.random } = {}) {
    const { min } = asset;
    const maxMove = settings.maxMovePercent / 100;
    // The palace: fully random, no ceiling, demand ignored (a sold forecast's locked price still wins).
    if (asset.wild) {
        if (Number.isSafeInteger(entry.locked) && entry.locked > 0) return { price: entry.locked, previous: entry.price, raise: 0, roll: rng(), flow: {} };
        const move = ((isRoll(entry.roll) ? entry.roll : rng()) * 2 - 1) * maxMove;
        const price = keepInside(Math.round(entry.price * (1 + move)), min, Infinity, rng);
        return { price, previous: entry.price, raise: 0, roll: rng(), flow: {} };
    }
    // 20+ pieces bought in the hour: a sure rise that grows with the number of pieces, no random part.
    const sureRise = guaranteedRise(entry.flow, maxMove, settings.demand);
    const demand = sureRise || demandMove(entry.flow, settings.demand);
    const raise = demand > 0
        ? Math.min(settings.demand.maxRaisePercent, entry.raise + demand * 100)
        : Math.max(0, entry.raise - settings.demand.raiseDecayPercent);
    const ceiling = assetCeiling(asset, raise);
    const position = (entry.price - min) / (ceiling - min);

    let lean = 0;
    if (demand <= 0 && entry.price > ceiling) lean = -maxMove;
    else if (demand <= 0 && position > 0.85) lean = -maxMove / 2;
    else if (position < 0.15) lean = maxMove / 2;

    // A price fixed by a sold forecast wins (see `locked` at the top); the ceiling is kept above it so it
    // isn't moved when the market is read again.
    if (Number.isSafeInteger(entry.locked) && entry.locked > 0) {
        const needed = Math.min(settings.demand.maxRaisePercent, Math.max(0, Math.ceil((entry.locked / asset.max - 1) * 100)));
        return { price: entry.locked, previous: entry.price, raise: Math.max(Math.round(raise * 100) / 100, needed), roll: rng(), flow: {} };
    }

    // The draw made in advance for this hour (see `roll` at the top), or a fresh one.
    const move = sureRise || clamp(((isRoll(entry.roll) ? entry.roll : rng()) * 2 - 1) * maxMove + lean + demand, -maxMove, maxMove);
    const price = keepInside(Math.round(entry.price * (1 + move)), min, ceiling, rng);
    return { price, previous: entry.price, raise: Math.round(raise * 100) / 100, roll: rng(), flow: {} };
}

/**
 * Where an asset's price goes at the next hour with the demand so far: `{ price, changePercent }`.
 * Buying and selling before the hour ends can still change it a little.
 */
export function forecastAsset(asset, entry, { settings = bourseSettings } = {}) {
    const next = tickAsset(asset, entry, { settings, rng: () => 0.5 });
    const changePercent = entry.price ? Math.round(((next.price - entry.price) / entry.price) * 1000) / 10 : 0;
    return { price: next.price, changePercent };
}

/** Plays every hour between the market's hour and `hour`. Returns true when something changed. */
export function advanceMarket(market, hour, { assets = bourseAssets, settings = bourseSettings, rng = Math.random } = {}) {
    if (market.hour >= hour) return false;
    const ticks = Math.min(hour - market.hour, settings.maxCatchUpHours);
    for (let i = 0; i < ticks; i += 1) {
        for (const asset of assets) {
            market.assets[asset.id] = tickAsset(asset, market.assets[asset.id], { settings, rng });
        }
    }
    market.hour = hour;
    return true;
}

/** Other servers than ours: no move drawn in advance (each hour draws its own, as before) and no locked price. */
function stripRolls(market) {
    for (const entry of Object.values(market.assets)) {
        delete entry.roll;
        delete entry.locked;
    }
}

/**
 * Runs `change(market)` on the guild's market, moved to the current hour, one change per guild at a
 * time. The market is saved when anything changed.
 */
async function withMarket(client, guildId, change, { now = Date.now(), rng = Math.random, assets = assetsFor(guildId) } = {}) {
    if (!client?.db?.get) throw new Error('Database not available');
    return Mutex.runExclusive(`bourse:${guildId}`, async () => {
        const key = getBourseKey(guildId);
        const raw = await client.db.get(key, null);
        const preRoll = isHomeGuild(guildId);
        const market = normalizeMarket(raw, { assets, hour: hourOf(now), rng });
        if (!preRoll) stripRolls(market);
        const before = JSON.stringify(market);
        advanceMarket(market, hourOf(now), { assets, rng });
        if (!preRoll) stripRolls(market);
        const result = await change(market);
        if (!raw || JSON.stringify(market) !== before) {
            const saved = await client.db.set(key, market);
            if (saved === false) logger.error(`[BOURSE] Failed to save the market of ${guildId}`);
        }
        return result;
    });
}

function quote(asset, entry) {
    const change = entry.previous ? ((entry.price - entry.previous) / entry.previous) * 100 : 0;
    return {
        asset,
        price: entry.price,
        previous: entry.previous,
        changePercent: Math.round(change * 10) / 10,
        ceiling: assetCeiling(asset, entry.raise),
        raised: entry.raise > 0,
    };
}

/** The prices of the hour: `{ quotes: [{ asset, price, previous, changePercent, ceiling, raised }], nextChangeAt }`. */
export async function getMarket(client, guildId, options = {}) {
    const assets = options.assets || assetsFor(guildId);
    const quotes = await withMarket(client, guildId, (market) => assets.map((asset) => quote(asset, market.assets[asset.id])), options);
    return { quotes, nextChangeAt: nextChangeAt(options.now) };
}

/**
 * The store's forecast: `{ forecasts: [{ asset, current, next, changePercent }], nextChangeAt }`, one per
 * asset. The forecast price is locked in for the next hour (see `locked` at the top), so it is exactly
 * what the price will be; a second forecast in the same hour shows the same locked prices.
 */
export async function forecastMarket(client, guildId, options = {}) {
    const assets = options.assets || assetsFor(guildId);
    const lock = isHomeGuild(guildId);
    const forecasts = await withMarket(client, guildId, (market) => assets.map((asset) => {
        const entry = market.assets[asset.id];
        let next = Number.isSafeInteger(entry.locked) ? entry.locked : forecastAsset(asset, entry).price;
        if (lock) entry.locked = next;
        else next = forecastAsset(asset, entry).price;
        const changePercent = entry.price ? Math.round(((next - entry.price) / entry.price) * 1000) / 10 : 0;
        return { asset, current: entry.price, next, changePercent };
    }), options);
    return { forecasts, nextChangeAt: nextChangeAt(options.now) };
}

/** The sell fee on `gross` CC: sellFeePercent, rounded up, at least 1 CC. */
export function sellFee(gross, percent = bourseSettings.sellFeePercent) {
    return percent > 0 && gross > 0 ? Math.max(1, Math.ceil((gross * percent) / 100)) : 0;
}

export function readHoldings(record = {}) {
    const holdings = {};
    for (const [assetId, held] of Object.entries(record.ccBourse || {})) {
        const qty = Number(held?.qty);
        if (Number.isSafeInteger(qty) && qty > 0) holdings[assetId] = { qty, cost: Math.max(0, Math.round(Number(held.cost) || 0)) };
    }
    return holdings;
}

function validQuantity(quantity) {
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= bourseSettings.maxOwnedPerAsset;
}

/**
 * `استثمار`: buys `quantity` pieces of an asset at the price of the hour. With `expectedPrice` (the
 * price the member confirmed) the purchase stops if the price changed since.
 * Returns `{ ok: true, asset, quantity, price, cost, before, balance, owned }` (`before` and `balance`
 * are the CC before and after, read in the same save) or `{ ok: false, reason }` with
 * reason one of: not_found, bad_quantity, price_changed (with `price`), max_owned (with `owned`), no_cc (with `balance`).
 */
export async function invest(client, guildId, userId, assetQuery, quantity = 1, { expectedPrice = null, ...options } = {}) {
    const asset = findAsset(assetQuery, options.assets || assetsFor(guildId));
    if (!asset) return { ok: false, reason: 'not_found' };
    if (!validQuantity(quantity)) return { ok: false, reason: 'bad_quantity' };

    return withMarket(client, guildId, async (market) => {
        const entry = market.assets[asset.id];
        const price = entry.price;
        if (expectedPrice !== null && expectedPrice !== price) return { ok: false, reason: 'price_changed', asset, quantity, price };
        const cost = price * quantity;

        const result = await updateCCState(client, guildId, userId, (state, record) => {
            const holdings = readHoldings(record);
            const held = holdings[asset.id] || { qty: 0, cost: 0 };
            if (held.qty + quantity > maxOwnedOf(asset)) return { ok: false, reason: 'max_owned', owned: held.qty, skipSave: true };
            if (state.cc < cost) return { ok: false, reason: 'no_cc', balance: state.cc, skipSave: true };
            const before = state.cc;
            state.cc -= cost;
            holdings[asset.id] = { qty: held.qty + quantity, cost: held.cost + cost };
            record.ccBourse = holdings;
            return { ok: true, owned: held.qty + quantity, before };
        });
        if (!result.ok) return { ...result, asset, quantity, price };

        entry.flow[userId] = (entry.flow[userId] || 0) + quantity;
        logger.info('[BOURSE] Bought', { guildId, userId, assetId: asset.id, quantity, price, cost });
        return { ok: true, asset, quantity, price, cost, before: result.before, balance: result.balance, owned: result.owned };
    }, options);
}

/**
 * `بيع`: sells `quantity` pieces at the price of the hour, minus the sell fee.
 * Returns `{ ok: true, asset, quantity, price, gross, fee, received, paid, profit, before, balance, owned }` or
 * `{ ok: false, reason }` with reason one of: not_found, bad_quantity, price_changed (with `price`), not_owned (with `owned`).
 */
export async function sell(client, guildId, userId, assetQuery, quantity = 1, { expectedPrice = null, ...options } = {}) {
    const asset = findAsset(assetQuery, options.assets || assetsFor(guildId));
    if (!asset) return { ok: false, reason: 'not_found' };
    if (!validQuantity(quantity)) return { ok: false, reason: 'bad_quantity' };

    return withMarket(client, guildId, async (market) => {
        const entry = market.assets[asset.id];
        const price = entry.price;
        if (expectedPrice !== null && expectedPrice !== price) return { ok: false, reason: 'price_changed', asset, quantity, price };
        const gross = price * quantity;
        const fee = sellFee(gross);
        const received = gross - fee;

        const result = await updateCCState(client, guildId, userId, (state, record) => {
            const holdings = readHoldings(record);
            const held = holdings[asset.id] || { qty: 0, cost: 0 };
            if (held.qty < quantity) return { ok: false, reason: 'not_owned', owned: held.qty, skipSave: true };
            const before = state.cc;
            const next = state.cc + received;
            if (!Number.isSafeInteger(next)) throw new Error('CC balance overflow');
            state.cc = next;
            // What the sold pieces cost, at the average price paid for the pieces held.
            const paid = held.qty === quantity ? held.cost : Math.round((held.cost * quantity) / held.qty);
            const left = held.qty - quantity;
            if (left > 0) holdings[asset.id] = { qty: left, cost: held.cost - paid };
            else delete holdings[asset.id];
            record.ccBourse = holdings;
            return { ok: true, owned: left, paid, before };
        });
        if (!result.ok) return { ...result, asset, quantity, price };

        entry.flow[userId] = (entry.flow[userId] || 0) - quantity;
        logger.info('[BOURSE] Sold', { guildId, userId, assetId: asset.id, quantity, price, fee });
        return {
            ok: true, asset, quantity, price, gross, fee, received,
            paid: result.paid, profit: received - result.paid, before: result.before, balance: result.balance, owned: result.owned,
        };
    }, options);
}

/**
 * `ممتلكاتي`: what the member owns at the prices of the hour. Returns `{ rows, quotes, totalValue,
 * totalPaid, totalIfSold }` (`quotes` as in getMarket); each row is `{ asset, qty, paid, price, value, ifSold, profit }` (`ifSold` is after the fee).
 */
export async function getHoldings(client, guildId, userId, options = {}) {
    const assets = options.assets || assetsFor(guildId);
    const { quotes } = await getMarket(client, guildId, options);
    const record = await client.db.get(getEconomyKey(guildId, userId), {});
    const holdings = readHoldings(record || {});

    const rows = [];
    for (const { asset, price } of quotes) {
        const held = holdings[asset.id];
        if (!held) continue;
        const value = price * held.qty;
        const ifSold = value - sellFee(value);
        rows.push({ asset, qty: held.qty, paid: held.cost, price, value, ifSold, profit: ifSold - held.cost });
    }
    rows.sort((a, b) => assets.indexOf(a.asset) - assets.indexOf(b.asset));
    return {
        rows,
        quotes,
        totalValue: rows.reduce((sum, row) => sum + row.value, 0),
        totalPaid: rows.reduce((sum, row) => sum + row.paid, 0),
        totalIfSold: rows.reduce((sum, row) => sum + row.ifSold, 0),
    };
}

/** What `holdings` (readHoldings) would sell for at `prices` (assetId -> price), after the sell fee on each asset. */
export function holdingsSellValue(holdings, prices) {
    let total = 0;
    for (const [assetId, held] of Object.entries(holdings)) {
        const value = (prices.get(assetId) || 0) * held.qty;
        total += value - sellFee(value);
    }
    return total;
}

/**
 * `top cc` in our server (report #189): every member's CC plus what their bourse holdings would sell
 * for right now, ranked by the total. Rows are `{ userId, cc, holdings, total, earned }`.
 */
export async function getWealthLeaderboard(client, guildId, options = {}) {
    const { quotes } = await getMarket(client, guildId, options);
    const prices = new Map(quotes.map(({ asset, price }) => [asset.id, price]));
    const prefix = getEconomyPrefix(guildId);
    const keys = await client.db.list(prefix);
    const rows = [];
    for (const key of Array.isArray(keys) ? keys : []) {
        const record = await client.db.get(key, null) || {};
        const { cc, stats } = readCC(record);
        const holdings = holdingsSellValue(readHoldings(record), prices);
        if (cc + holdings > 0) rows.push({ userId: key.slice(prefix.length), cc, holdings, total: cc + holdings, earned: stats.earned });
    }
    return rows.sort((a, b) => b.total - a.total || b.earned - a.earned);
}
