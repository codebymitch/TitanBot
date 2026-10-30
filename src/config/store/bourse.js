// bourse.js — the CC bourse (البورصة): 8 things members buy with CC and sell back later at the
// price of the hour. Run by src/services/cc/bourseService.js, commands in src/commands/Games/bourse.js
// (`اسعار`، `استثمار 3`، `بيع 3`، `ممتلكاتي`).
//
// Prices change at the start of every hour (5:00, 6:00, 7:00...). Each hour an asset moves up or down
// by a random amount of at most `maxMovePercent` (20%) of its last price (the owner's rule: never
// more than 20% up or down in one hour, reports #139 and #140), and never leaves [min, max]. Near a limit the move leans back towards
// the middle so the price doesn't stick to it, and a price never lands on a limit itself, so prices
// always look random (1,325, not 2,000).
//
// Demand: every member who bought an asset during the hour (more than they sold) pushes its next
// move up by `demand.perBuyerPercent`, every net seller pushes it down, together at most
// `demand.maxPercent` (the whole move still stays within `maxMovePercent`). When 20 or more pieces
// were bought in the hour (net of sales), the price is sure to go up at the next update, by
// `demand.perUnitPercent` per piece (see `guaranteedRiseUnits` below), with no random part. Buying also lifts the asset's ceiling above `max` (by the same percent, up to
// `demand.maxRaisePercent`); an hour with no buying demand lowers it again by
// `demand.raiseDecayPercent`, so the price comes back to its normal range by itself.
//
// Asset fields: id (lowercase, stays the same forever: it is the key in members' holdings), name,
// emoji, min, max, start and volatility (the very first price is random around `start`, up to
// `volatility` away; after that every hour moves at most `maxMovePercent`).

export const bourseAssets = [
    { id: 'motorcycle', name: 'موتوسيكل', emoji: '🏍️', min: 200, max: 600, start: 400, volatility: 0.08 },
    { id: 'gold', name: 'سبيكة دهب', emoji: '🥇', min: 300, max: 900, start: 600, volatility: 0.03 },
    { id: 'car', name: 'عربية', emoji: '🚗', min: 800, max: 2000, start: 1300, volatility: 0.05 },
    { id: 'apartment', name: 'شقة', emoji: '🏠', min: 1500, max: 3500, start: 2400, volatility: 0.03 },
    { id: 'shop', name: 'محل تجاري', emoji: '🏪', min: 2500, max: 5500, start: 4000, volatility: 0.05 },
    { id: 'building', name: 'عقار (عمارة)', emoji: '🏢', min: 4000, max: 9000, start: 6000, volatility: 0.03 },
    { id: 'ship', name: 'سفينة', emoji: '🚢', min: 6000, max: 13000, start: 9000, volatility: 0.08 },
    { id: 'plane', name: 'طيارة', emoji: '✈️', min: 8000, max: 18000, start: 12000, volatility: 0.1 },
    // Our server only (homeOnly, report #209): the palace starts around 50,000, a member can own 5 at most
    // (maxOwned), and its price is fully random (wild): each hour a random move of up to maxMovePercent up
    // or down, no ceiling (it can reach 500,000 and more), never below `min`, and demand doesn't move it.
    { id: 'palace', name: 'قصر', emoji: '🏰', min: 10000, max: Infinity, start: 50000, volatility: 0.1, maxOwned: 5, wild: true, homeOnly: true },
];

export const bourseSettings = {
    // Taken from what a member gets when selling (rounded up, at least 1 CC).
    sellFeePercent: 1.5,
    // Most pieces of one asset a member can own.
    maxOwnedPerAsset: 25,
    // Most a price can go up or down in one hourly update, demand included.
    maxMovePercent: 20,
    demand: {
        perBuyerPercent: 1,
        maxPercent: 15,
        maxRaisePercent: 50,
        raiseDecayPercent: 5,
        // When members bought at least this many pieces of an asset in the hour (net of sales), its
        // price is sure to rise at the next update, by `perUnitPercent` per piece (20 pieces = +5%,
        // 40 = +10%, 80 or more = +20%), still at most `maxMovePercent`.
        guaranteedRiseUnits: 20,
        perUnitPercent: 0.25,
    },
    // After the bot was off, at most this many missed hours are replayed.
    maxCatchUpHours: 168,
};

// `بيع كلو` / `بيع عربية كلو`: the words that mean "all of it" after بيع (our server only, owner's request).
export const SELL_ALL_WORDS = new Set(['كلو', 'كله', 'كلهم', 'الكل', 'all']);
export const isSellAllWord = (word) => SELL_ALL_WORDS.has(String(word || '').toLowerCase());

export function normalizeName(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u0652\u0640]/gu, '') // tashkeel and tatweel
        .replace(/[أإآ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .replace(/^ال/u, '')
        .replace(/\s+/gu, ' ');
}

/** Finds an asset by its number in the list (`1` is the first), its id or its name (`عربية`، `العربيه`). */
export function findAsset(query, assets = bourseAssets) {
    const text = String(query || '').trim();
    if (/^\d{1,2}$/u.test(text)) return assets[Number(text) - 1] || null;
    const wanted = normalizeName(text);
    if (!wanted) return null;
    return assets.find((asset) => asset.id === text.toLowerCase())
        || assets.find((asset) => normalizeName(asset.name) === wanted)
        || assets.find((asset) => normalizeName(asset.name).split(/[\s()]+/u).includes(wanted))
        || null;
}
