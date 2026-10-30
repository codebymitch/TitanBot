import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bourseAssets, bourseSettings } from '../src/config/store/bourse.js';
import {
    HOUR_MS, hourOf, nextChangeAt, assetCeiling, keepInside, normalizeMarket, demandMove, tickAsset, advanceMarket,
    findAsset, sellFee, getMarket, invest, sell, getHoldings,
} from '../src/services/cc/bourseService.js';
import { adjustCC, getProfile } from '../src/services/cc/ccService.js';
import { changeArrow, pricesEmbed } from '../src/services/cc/bourseUi.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';

const GUILD = '100000000000000009';
const A = '200000000000000001';
const B = '200000000000000002';
const NOW = Date.UTC(2026, 8, 25, 17, 20);

function fakeClient() {
    const store = new Map();
    return {
        store,
        db: {
            get: async (key, fallback = null) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
            set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
            list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
        },
    };
}

/** A repeatable random number generator. */
function seeded(seed = 1) {
    let value = seed;
    return () => {
        value = (value * 1664525 + 1013904223) % 4294967296;
        return value / 4294967296;
    };
}

const byId = (id) => bourseAssets.find((asset) => asset.id === id);

describe('bourse config', () => {
    test('has at most 9 valid assets (8 everywhere, plus the palace in our server)', () => {
        assert.ok(bourseAssets.length <= 9);
        assert.equal(new Set(bourseAssets.map((asset) => asset.id)).size, bourseAssets.length);
        for (const asset of bourseAssets) {
            assert.ok(asset.min > 0 && asset.min < asset.start && asset.start < asset.max, asset.id);
            assert.ok(asset.volatility > 0 && asset.volatility < 0.5, asset.id);
        }
    });
});

describe('bourse prices', () => {
    test('change at the start of each hour', () => {
        assert.equal(hourOf(NOW), hourOf(Date.UTC(2026, 8, 25, 17, 0)));
        assert.equal(nextChangeAt(NOW), Date.UTC(2026, 8, 25, 18, 0));
    });

    test('a new market starts at random prices around the start prices', () => {
        const market = normalizeMarket(null, { hour: 10, rng: seeded(5) });
        assert.equal(market.hour, 10);
        for (const asset of bourseAssets) {
            const { price } = market.assets[asset.id];
            assert.ok(Math.abs(price - asset.start) <= Math.ceil(asset.start * asset.volatility), asset.id);
        }
        assert.ok(bourseAssets.some((asset) => market.assets[asset.id].price !== asset.start));
        // A middle draw is the start price itself.
        assert.equal(normalizeMarket(null, { rng: () => 0.5 }).assets.car.price, 1300);
    });

    test('prices never land on a round limit', () => {
        assert.equal(keepInside(1500, 800, 2000), 1500);
        const top = keepInside(2400, 800, 2000, () => 0.99);
        assert.ok(top < 2000 && top >= 2000 - 1 - 24, String(top));
        const bottom = keepInside(700, 800, 2000, () => 0);
        assert.equal(bottom, 801);
        const rng = seeded(9);
        for (const asset of bourseAssets) {
            let entry = normalizeMarket(null, { rng }).assets[asset.id];
            for (let hour = 0; hour < 500; hour += 1) {
                entry = tickAsset(asset, entry, { rng });
                assert.ok(entry.price !== asset.min && entry.price !== asset.max, `${asset.id} ${entry.price}`);
            }
        }
    });

    test('random moves stay between min and max and never move more than 20% an hour', () => {
        const rng = seeded(7);
        for (const asset of bourseAssets) {
            let entry = normalizeMarket(null, { rng }).assets[asset.id];
            for (let hour = 0; hour < 2000; hour += 1) {
                const next = tickAsset(asset, entry, { rng });
                assert.ok(next.price > asset.min && next.price < asset.max, `${asset.id} ${next.price}`);
                assert.ok(Math.abs(next.price - entry.price) <= Math.ceil(entry.price * 0.2) + 1, `${asset.id} ${entry.price} -> ${next.price}`);
                entry = next;
            }
        }
    });

    test('an hour moves by at most 20% up or down, whatever the demand (reports #139, #140)', () => {
        assert.equal(bourseSettings.maxMovePercent, 20);
        const car = byId('car');
        const entry = { price: 1300, previous: 1300, raise: 0, flow: {} };
        assert.equal(tickAsset(car, entry, { rng: () => 1 }).price, Math.round(1300 * 1.2));
        assert.equal(tickAsset(car, entry, { rng: () => 0 }).price, Math.round(1300 * 0.8));
        const rush = { ...entry, flow: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`u${i}`, 1])) };
        assert.equal(tickAsset(car, rush, { rng: () => 1 }).price, Math.round(1300 * 1.2));
        // At the top the move leans down, at the bottom up.
        assert.ok(tickAsset(car, { ...entry, price: 1990 }, { rng: () => 0.5 }).price < 1990);
        assert.ok(tickAsset(car, { ...entry, price: 810 }, { rng: () => 0.5 }).price > 810);
    });

    test('demand pushes the price up and lifts the ceiling, which comes back down after', () => {
        const car = byId('car');
        const flow = { a: 2, b: 1, c: 5, d: -1 };
        assert.equal(demandMove(flow), (3 - 1) * bourseSettings.demand.perBuyerPercent / 100);
        assert.equal(demandMove({}), 0);

        let entry = { price: 2000, previous: 2000, raise: 0, flow: { a: 1, b: 1, c: 1, d: 1, e: 1 } };
        entry = tickAsset(car, entry, { rng: () => 1 });
        assert.equal(entry.raise, 5);
        assert.ok(entry.price > car.max && entry.price <= assetCeiling(car, 5));
        assert.deepEqual(entry.flow, {});

        for (let hour = 0; hour < 10; hour += 1) entry = tickAsset(car, entry, { rng: () => 1 });
        assert.equal(entry.raise, 0);
        assert.ok(entry.price <= car.max);
    });

    test('20+ pieces bought in the hour: the price is sure to rise, by the number of pieces', () => {
        const car = byId('car');
        const bought = (pieces) => ({ price: 1300, previous: 1300, raise: 0, flow: { a: pieces - 5, b: 5 } });
        // Below 20 pieces, a low random draw can still bring the price down.
        assert.ok(tickAsset(car, bought(19), { rng: () => 0 }).price < 1300);
        // 20 pieces: +5% whatever the random draw; 30: +7.5%; 80 or more: +20% (the hourly cap).
        for (const rng of [() => 0, () => 0.5, () => 0.99]) {
            assert.equal(tickAsset(car, bought(20), { rng }).price, Math.round(1300 * 1.05));
        }
        assert.equal(tickAsset(car, bought(30), { rng: () => 0 }).price, Math.round(1300 * 1.075));
        assert.equal(tickAsset(car, bought(80), { rng: () => 0 }).price, Math.round(1300 * 1.2));
        assert.equal(tickAsset(car, bought(200), { rng: () => 0 }).price, Math.round(1300 * 1.2));
        // Sales count against the purchases.
        assert.ok(tickAsset(car, { ...bought(20), flow: { a: 25, b: -6 } }, { rng: () => 0 }).price < 1300);
        // Near the top the ceiling rises with it, so the sure rise isn't cut off.
        const top = tickAsset(car, { ...bought(20), price: 1990 }, { rng: () => 0 });
        assert.ok(top.price > 1990 && top.raise > 0, `${top.price}`);
    });

    test('selling pressure pushes the price down', () => {
        const car = byId('car');
        const entry = { price: 1300, previous: 1300, raise: 0, flow: { a: -1, b: -1, c: -1 } };
        assert.equal(tickAsset(car, entry, { rng: () => 0.5 }).price, Math.round(1300 * 0.97));
    });

    test('missed hours are played when the market is read later, up to the cap', () => {
        const market = normalizeMarket(null, { hour: 100 });
        assert.equal(advanceMarket(market, 100), false);
        assert.equal(advanceMarket(market, 103, { rng: seeded(3) }), true);
        assert.equal(market.hour, 103);
        let calls = 0;
        advanceMarket(market, 103 + 10_000, { rng: () => { calls += 1; return 0.5; } });
        assert.equal(calls, bourseSettings.maxCatchUpHours * bourseAssets.length);
    });
});

describe('bourse trading', () => {
    test('finds assets by number or name', () => {
        assert.equal(findAsset('1'), bourseAssets[0]);
        assert.equal(findAsset('10'), null);
        assert.equal(findAsset('قصر').id, 'palace');
        assert.equal(findAsset('عربيه').id, 'car');
        assert.equal(findAsset('العربية').id, 'car');
        assert.equal(findAsset('طياره').id, 'plane');
        assert.equal(findAsset('عقار').id, 'building');
        assert.equal(findAsset('plane').id, 'plane');
        assert.equal(findAsset('حاجة'), null);
    });

    test('the sell fee is 1.5%, rounded up', () => {
        assert.equal(bourseSettings.sellFeePercent, 1.5);
        assert.equal(sellFee(1000), 15);
        assert.equal(sellFee(1001), 16);
        assert.equal(sellFee(10), 1);
        assert.equal(sellFee(0), 0);
    });

    test('buys and sells at the price of the hour', async () => {
        const client = fakeClient();
        const options = { now: NOW, rng: seeded(11) };
        await adjustCC(client, GUILD, A, 5000, 'staff');

        const { quotes } = await getMarket(client, GUILD, options);
        const car = quotes.find((entry) => entry.asset.id === 'car');
        assert.ok(car.price > byId('car').min && car.price < byId('car').max);

        assert.equal((await invest(client, GUILD, A, 'nothing', 1, options)).reason, 'not_found');
        assert.equal((await invest(client, GUILD, A, 'car', 0, options)).reason, 'bad_quantity');
        assert.equal((await invest(client, GUILD, A, 'car', 26, options)).reason, 'bad_quantity');
        assert.equal((await invest(client, GUILD, A, 'car', 1, { ...options, expectedPrice: 1 })).reason, 'price_changed');
        assert.equal((await invest(client, GUILD, A, 'plane', 1, options)).reason, 'no_cc');

        const bought = await invest(client, GUILD, A, '3', 2, { ...options, expectedPrice: car.price });
        assert.deepEqual([bought.ok, bought.cost, bought.owned, bought.before, bought.balance], [true, car.price * 2, 2, 5000, 5000 - car.price * 2]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 5000 - car.price * 2);

        // The purchase counts as demand for the next hour.
        const saved = client.store.get(`guild:${GUILD}:bourse`);
        assert.equal(saved.assets.car.flow[A], 2);

        assert.equal((await sell(client, GUILD, A, 'car', 3, options)).reason, 'not_owned');
        assert.equal((await sell(client, GUILD, B, 'car', 1, options)).reason, 'not_owned');
        const sold = await sell(client, GUILD, A, 'car', 1, options);
        const fee = sellFee(car.price);
        assert.deepEqual([sold.ok, sold.fee, sold.received, sold.paid, sold.profit, sold.owned], [true, fee, car.price - fee, car.price, -fee, 1]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 5000 - car.price - fee);
        assert.deepEqual([sold.before, sold.balance], [5000 - car.price * 2, 5000 - car.price - fee]);
        assert.equal(client.store.get(`guild:${GUILD}:bourse`).assets.car.flow[A], 1);

        const holdings = await getHoldings(client, GUILD, A, options);
        assert.equal(holdings.rows.length, 1);
        assert.deepEqual([holdings.rows[0].qty, holdings.rows[0].paid, holdings.rows[0].value], [1, car.price, car.price]);
    });

    test('a new hour changes the prices and the demand of the last hour counts', async () => {
        const client = fakeClient();
        await adjustCC(client, GUILD, A, 100_000, 'staff');
        await adjustCC(client, GUILD, B, 100_000, 'staff');
        const hold = { now: NOW, rng: () => 0.5 };
        await invest(client, GUILD, A, 'car', 1, hold);
        await invest(client, GUILD, B, 'car', 1, hold);

        const later = { now: NOW + HOUR_MS, rng: () => 0.5 };
        const { quotes } = await getMarket(client, GUILD, later);
        const car = quotes.find((entry) => entry.asset.id === 'car');
        // A middle random draw: only the 2 buyers moved it (1% each).
        assert.equal(car.price, Math.round(byId('car').start * 1.02));
        assert.equal(car.changePercent, 2);
        const gold = quotes.find((entry) => entry.asset.id === 'gold');
        assert.equal(gold.price, byId('gold').start);

        // Buying a piece they already had at the old price: the old price is refused.
        assert.equal((await invest(client, GUILD, A, 'car', 1, { ...later, expectedPrice: byId('car').start })).reason, 'price_changed');
    });

    test('never owns more than 25 of one asset (report #158)', async () => {
        assert.equal(bourseSettings.maxOwnedPerAsset, 25);
        const client = fakeClient();
        const options = { now: NOW, rng: () => 0.5 };
        await adjustCC(client, GUILD, A, 100_000, 'staff');
        assert.equal((await invest(client, GUILD, A, 'motorcycle', 25, options)).ok, true);
        const refused = await invest(client, GUILD, A, 'motorcycle', 1, options);
        assert.deepEqual([refused.reason, refused.owned], ['max_owned', 25]);
    });
});

describe('bourse messages', () => {
    test('show the move with an arrow', () => {
        assert.equal(changeArrow(6.1), '🟢 ▲ 6.1%');
        assert.equal(changeArrow(-1.2), '🔴 ▼ 1.2%');
        assert.equal(changeArrow(0), '');
    });

    test('the prices embed lists every asset', async () => {
        const market = await getMarket(fakeClient(), GUILD, { now: NOW });
        const embed = pricesEmbed(market);
        // Another server: every asset but the palace (ours only).
        for (const asset of bourseAssets.filter((entry) => !entry.homeOnly)) assert.ok(embed.fields.some((field) => field.name.includes(asset.name) && field.inline), asset.id);
        assert.ok(!embed.fields.some((field) => field.name.includes('قصر')));
        assert.ok(embed.fields.length <= 25);
        assert.ok(embed.footer.text.includes('1.5%'));
    });
});

describe('bourse balance', () => {
    test('buying takes exactly the price from the balance', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD}:economy:${A}`, { wallet: 999, bank: 5, cc: 710 });
        const result = await invest(client, GUILD, A, 'gold', 1, { now: NOW, rng: () => 0.5 });
        assert.deepEqual([result.price, result.before, result.balance], [600, 710, 110]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 110);
    });
});

describe('bourse words', () => {
    test('run with an asset name without the prefix, but not in a normal sentence', () => {
        assert.deepEqual(applyWordAliases('استثمار', ['عربية'], false), { commandName: 'bourse', args: ['invest', 'عربية'] });
        assert.deepEqual(applyWordAliases('بيع', ['سبيكة', 'دهب', '2'], false), { commandName: 'bourse', args: ['sell', 'سبيكة', 'دهب', '2'] });
        assert.deepEqual(applyWordAliases('بيع', ['3'], false), { commandName: 'bourse', args: ['sell', '3'] });
        assert.equal(applyWordAliases('بيع', ['العربية', 'دي'], false), null);
        assert.equal(applyWordAliases('استثمار', ['في', 'الدهب', 'حلو'], false), null);
        assert.equal(applyWordAliases('اسعار', ['الدهب'], false), null);
    });
});

describe('top cc and other members\' holdings (reports #188, #189)', () => {
    test('in our server top cc ranks CC plus holdings at their sell price; another server shows CC only', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const { getWealthLeaderboard } = await import('../src/services/cc/bourseService.js');
        const { ccTopEmbed } = await import('../src/commands/Games/cctop.js');
        for (const guildId of [HOME_GUILD_ID, GUILD]) {
            const client = fakeClient();
            await adjustCC(client, guildId, A, 5000);
            await adjustCC(client, guildId, B, 3000);
            assert.equal((await invest(client, guildId, A, 'motorcycle', 3, { now: NOW, rng: seeded(3) })).ok, true);
            const { cc } = await getProfile(client, guildId, A);
            const { totalIfSold } = await getHoldings(client, guildId, A, { now: NOW, rng: seeded(3) });
            const board = await getWealthLeaderboard(client, guildId, { now: NOW, rng: seeded(3) });
            assert.deepEqual(board.find((row) => row.userId === A), { userId: A, cc, holdings: totalIfSold, total: cc + totalIfSold, earned: 0 });

            const text = (await ccTopEmbed(client, { id: guildId, name: 'Chaos' }, A)).description;
            if (guildId === HOME_GUILD_ID) {
                assert.match(text, new RegExp(`<@${A}> — \\*\\*[\\d,]+\\*\\* CC \\(🌀 ${cc.toLocaleString('en-US')} \\+ 📈 [\\d,]+\\)`, 'u'));
                assert.match(text, /بعد الضريبة/u);
            } else {
                assert.doesNotMatch(text, /📈/u);
                assert.match(text, new RegExp(`<@${A}> — \\*\\*${cc.toLocaleString('en-US')}\\*\\* CC`, 'u'));
            }
        }
    });

    test('`ممتلكات @member` shows that member\'s holdings in our server; elsewhere your own', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const { GAMES_BOTS_CHANNEL_ID } = await import('../src/config/games.js');
        const { default: bourse } = await import('../src/commands/Games/bourse.js');
        const { holdingsEmbed } = await import('../src/services/cc/bourseUi.js');
        assert.ok(bourse.data.toJSON().options.find((sub) => sub.name === 'holdings').options.some((option) => option.name === 'user'));
        assert.deepEqual(applyWordAliases('ممتلكات', [`<@${B}>`], false), { commandName: 'bourse', args: ['holdings', `<@${B}>`] });
        const other = holdingsEmbed({ username: 'bee', toString: () => `<@${B}>` }, { rows: [], totalValue: 0, totalPaid: 0, totalIfSold: 0 }, { balance: 7, own: false });
        assert.equal(other.title, '💼 ممتلكات bee');
        assert.equal(other.fields[0].name, '💰 رصيده');

        for (const guildId of [HOME_GUILD_ID, GUILD]) {
            const client = fakeClient();
            await adjustCC(client, guildId, B, 4000);
            await invest(client, guildId, B, 'motorcycle', 1);
            const replies = [];
            const interaction = {
                id: '1', guildId, channelId: GAMES_BOTS_CHANNEL_ID, channel: { id: GAMES_BOTS_CHANNEL_ID },
                user: { id: A, username: 'ay', toString: () => `<@${A}>` },
                options: { getSubcommand: () => 'holdings', getUser: () => ({ id: B, username: 'bee', toString: () => `<@${B}>` }) },
                reply: async (payload) => { replies.push(payload); },
            };
            await bourse.execute(interaction, {}, client);
            const embed = replies[0].embeds[0];
            if (guildId === HOME_GUILD_ID) {
                assert.equal(embed.title, '💼 ممتلكات bee');
                assert.match(embed.description, /× 1/u);
            } else {
                assert.equal(embed.title, '💼 ممتلكاتي');
                assert.match(embed.description, new RegExp(`<@${A}>`, 'u'));
            }
        }
    });
});

describe('بيع كلو: sell everything, or all of one asset (owner\'s request)', () => {
    test('the words run the sell-all command, a normal sentence doesn\'t', async () => {
        const { default: bourse } = await import('../src/commands/Games/bourse.js');
        assert.deepEqual(applyWordAliases('بيع', ['كلو'], false), { commandName: 'bourse', args: ['sell', 'كلو'] });
        assert.deepEqual(applyWordAliases('بيع', ['عربية', 'الكل'], false), { commandName: 'bourse', args: ['sell', 'عربية', 'الكل'] });
        assert.equal(applyWordAliases('بيع', ['كله', 'يا', 'جماعة'], false), null);
        assert.deepEqual(bourse.normalizePrefixArgs(['sell', 'كلو']), ['sellall']);
        assert.deepEqual(bourse.normalizePrefixArgs(['sell', 'سبيكة', 'دهب', 'كله']), ['sellall', 'سبيكة دهب']);
        assert.deepEqual(bourse.normalizePrefixArgs(['sell', 'عربية', '2']), ['sell', 'عربية', '2']);
    });

    test('everything is confirmed, then sold at the prices of the hour; one asset sells all its pieces', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const { GAMES_BOTS_CHANNEL_ID } = await import('../src/config/games.js');
        const { default: bourse } = await import('../src/commands/Games/bourse.js');
        const { default: bourseButtons } = await import('../src/interactions/buttons/store/bourse.js');
        const [first, second] = bourseAssets;
        const client = fakeClient();
        await adjustCC(client, HOME_GUILD_ID, A, 100_000);
        assert.equal((await invest(client, HOME_GUILD_ID, A, first.id, 3)).ok, true);
        assert.equal((await invest(client, HOME_GUILD_ID, A, second.id, 2)).ok, true);

        const run = async (asset = null, guildId = HOME_GUILD_ID) => {
            const replies = [];
            await bourse.execute({
                id: '1', guildId, channelId: GAMES_BOTS_CHANNEL_ID, channel: { id: GAMES_BOTS_CHANNEL_ID }, user: { id: A, toString: () => `<@${A}>` },
                options: { getSubcommand: () => 'sellall', getString: () => asset, getInteger: () => null, getUser: () => null },
                reply: async (payload) => { replies.push(payload); },
            }, {}, client);
            return replies[0];
        };

        const one = await run(first.name);
        assert.match(one.components[0].toJSON().components[0].custom_id, new RegExp(`^bourse:sell:${first.id}:3:`));

        const all = await run();
        const button = all.components[0].toJSON().components[0].custom_id;
        assert.match(button, new RegExp(`^bourse:sellall:\\d+:${A}$`));
        assert.match(all.embeds[0].description, new RegExp(`× 3[\\s\\S]*× 2`));

        const before = (await getProfile(client, HOME_GUILD_ID, A)).cc;
        let edited;
        await bourseButtons.execute({
            inGuild: () => true, guildId: HOME_GUILD_ID, user: { id: A, toString: () => `<@${A}>` },
            deferUpdate: async () => {}, editReply: async (payload) => { edited = payload; }, reply: async () => {},
        }, client, button.split(':').slice(1));
        assert.match(edited.embeds[0].title, /اتباع كله/u);
        assert.deepEqual((await getHoldings(client, HOME_GUILD_ID, A)).rows, []);
        assert.ok((await getProfile(client, HOME_GUILD_ID, A)).cc > before);

        assert.match((await run()).content, /معندكش حاجة/u);
        assert.match((await run(null, GUILD)).content, /مش متاح/u);
    });
});

describe('the palace (report #209)', () => {
    test('in our server: starts around 50,000, 5 at most, fully random with no ceiling, demand ignored', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const palace = byId('palace');
        assert.equal(palace.maxOwned, 5);
        const market = await getMarket(fakeClient(), HOME_GUILD_ID, { now: NOW, rng: seeded(4) });
        const quote = market.quotes.find((entry) => entry.asset.id === 'palace');
        assert.ok(quote.price >= 45_000 && quote.price <= 55_000, String(quote.price));

        // No ceiling: from 480,000 a rise goes past 500,000; demand (even 100 pieces) doesn't change the move.
        const high = { price: 480_000, previous: 480_000, raise: 0, roll: 1, flow: {} };
        assert.equal(tickAsset(palace, high, { rng: () => 0.5 }).price, 576_000);
        assert.equal(tickAsset(palace, { ...high, flow: { a: 100 } }, { rng: () => 0.5 }).price, 576_000);
        assert.equal(tickAsset(palace, { ...high, roll: 0 }, { rng: () => 0.5 }).price, 384_000);
        // Never below its floor.
        assert.ok(tickAsset(palace, { price: 10_500, previous: 10_500, raise: 0, roll: 0, flow: {} }, { rng: () => 0 }).price > palace.min);

        const client = fakeClient();
        await adjustCC(client, HOME_GUILD_ID, A, 2_000_000);
        assert.equal((await invest(client, HOME_GUILD_ID, A, 'قصر', 5, { now: NOW, rng: seeded(4) })).ok, true);
        assert.equal((await invest(client, HOME_GUILD_ID, A, 'قصر', 1, { now: NOW, rng: seeded(4) })).reason, 'max_owned');
    });

    test('another server has no palace', async () => {
        const client = fakeClient();
        await adjustCC(client, GUILD, A, 2_000_000);
        assert.equal((await invest(client, GUILD, A, 'قصر', 1, { now: NOW })).reason, 'not_found');
        assert.ok(!(await getMarket(client, GUILD, { now: NOW })).quotes.some((entry) => entry.asset.id === 'palace'));
    });
});

describe('شراء عربية كلو: buy as many as the balance allows (owner\'s request)', () => {
    test('the words route to buymax; alone they are chat', async () => {
        const { default: bourse } = await import('../src/commands/Games/bourse.js');
        assert.deepEqual(applyWordAliases('شراء', ['عربية', 'كلو'], false), { commandName: 'bourse', args: ['invest', 'عربية', 'كلو'] });
        assert.equal(applyWordAliases('شراء', ['كلو'], false), null);
        assert.deepEqual(bourse.normalizePrefixArgs(['invest', 'سبيكة', 'دهب', 'كله']), ['buymax', 'سبيكة دهب']);
    });

    test('confirms the most pieces the balance and the limit allow; another server: not available', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const { GAMES_BOTS_CHANNEL_ID } = await import('../src/config/games.js');
        const { default: bourse } = await import('../src/commands/Games/bourse.js');
        const asset = bourseAssets[0];
        const run = async (client, guildId) => {
            const replies = [];
            await bourse.execute({
                id: '1', guildId, channelId: GAMES_BOTS_CHANNEL_ID, channel: { id: GAMES_BOTS_CHANNEL_ID }, user: { id: A, toString: () => `<@${A}>` },
                options: { getSubcommand: () => 'buymax', getString: () => asset.name, getInteger: () => null, getUser: () => null },
                reply: async (payload) => { replies.push(payload); },
            }, {}, client);
            return replies[0];
        };

        const client = fakeClient();
        const { quotes } = await getMarket(client, HOME_GUILD_ID);
        const { price } = quotes.find((entry) => entry.asset.id === asset.id);
        await adjustCC(client, HOME_GUILD_ID, A, price * 3 + 1);
        const three = await run(client, HOME_GUILD_ID);
        assert.match(three.components[0].toJSON().components[0].custom_id, new RegExp(`^bourse:buy:${asset.id}:3:${price}:`));

        // A big balance stops at the asset's limit.
        await adjustCC(client, HOME_GUILD_ID, A, price * 1000);
        const capped = await run(client, HOME_GUILD_ID);
        assert.match(capped.components[0].toJSON().components[0].custom_id, new RegExp(`^bourse:buy:${asset.id}:${bourseSettings.maxOwnedPerAsset}:`));

        const poor = fakeClient();
        assert.match((await run(poor, HOME_GUILD_ID)).content, /مش كفاية/u);
        assert.match((await run(poor, GUILD)).content, /مش متاح/u);
    });
});
