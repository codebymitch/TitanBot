import test from 'node:test';
import assert from 'node:assert/strict';

import { getEconomyData, setEconomyData } from '../src/utils/economy.js';
import { getFight } from '../src/utils/database/fights.js';
import { getFightKey } from '../src/utils/database/keys.js';
import { getOsrsLink, linkOsrsUsername } from '../src/utils/database/osrs.js';
import {
    expirePendingFights,
    handleFightAccept,
    handleFightChallenge,
    handleFightReport,
    resolveFightFromWebhook,
} from '../src/services/osrsStakingService.js';

class FakeDb {
    constructor() {
        this.store = new Map();
        this.counters = new Map();
    }

    async get(key, defaultValue = null) {
        return this.store.has(key) ? this.store.get(key) : defaultValue;
    }

    async set(key, value) {
        this.store.set(key, value);
        return true;
    }

    async delete(key) {
        this.store.delete(key);
        return true;
    }

    async list(prefix) {
        return [...this.store.keys()].filter((key) => key.startsWith(prefix));
    }

    async increment(key, amount = 1) {
        const nextValue = (this.counters.get(key) || 0) + amount;
        this.counters.set(key, nextValue);
        return nextValue;
    }
}

function createClient() {
    return { db: new FakeDb() };
}

async function seedWallet(client, guildId, userId, wallet) {
    await setEconomyData(client, guildId, userId, { wallet, bank: 0 });
}

test('linkOsrsUsername stores unique guild-scoped OSRS links', async () => {
    const client = createClient();
    const guildId = '100000000000000001';
    const userOne = '200000000000000001';
    const userTwo = '200000000000000002';

    await linkOsrsUsername(client, guildId, userOne, 'The One KC');
    const stored = await getOsrsLink(client, guildId, userOne);

    assert.equal(stored.osrsUsername, 'The One KC');

    await assert.rejects(
        () => linkOsrsUsername(client, guildId, userTwo, 'the one kc'),
        /already linked/i,
    );
});

test('fight challenge escrows both wallets and webhook awards the winner', async () => {
    const client = createClient();
    const guildId = '100000000000000002';
    const challengerId = '200000000000000011';
    const opponentId = '200000000000000012';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 20_000_000),
        seedWallet(client, guildId, opponentId, 20_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Risky A'),
        linkOsrsUsername(client, guildId, opponentId, 'Risky B'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 5_000_000);
    const pendingBalances = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);

    assert.equal(fight.status, 'pending');
    assert.equal(pendingBalances[0].wallet, 15_000_000);
    assert.equal(pendingBalances[1].wallet, 15_000_000);

    const activeFight = await handleFightAccept(client, guildId, fight.id, opponentId);
    assert.equal(activeFight.status, 'active');

    const resolvedFight = await resolveFightFromWebhook(client, guildId, 'Risky A', 'Risky B');
    const [winnerBalance, loserBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);

    assert.equal(resolvedFight.winner_id, challengerId);
    assert.equal(winnerBalance.wallet, 25_000_000);
    assert.equal(loserBalance.wallet, 15_000_000);
});

test('expirePendingFights refunds pending fights and auto-resolves reported active fights', async () => {
    const client = createClient();
    const guildId = '100000000000000003';
    const userA = '200000000000000021';
    const userB = '200000000000000022';
    const userC = '200000000000000023';
    const userD = '200000000000000024';

    await Promise.all([
        seedWallet(client, guildId, userA, 10_000_000),
        seedWallet(client, guildId, userB, 10_000_000),
        seedWallet(client, guildId, userC, 10_000_000),
        seedWallet(client, guildId, userD, 10_000_000),
        linkOsrsUsername(client, guildId, userA, 'Alpha'),
        linkOsrsUsername(client, guildId, userB, 'Beta'),
        linkOsrsUsername(client, guildId, userC, 'Gamma'),
        linkOsrsUsername(client, guildId, userD, 'Delta'),
    ]);

    const pendingFight = await handleFightChallenge(client, guildId, userA, userB, 1_000_000);
    const activeFight = await handleFightChallenge(client, guildId, userC, userD, 2_000_000);
    await handleFightAccept(client, guildId, activeFight.id, userD);
    await handleFightReport(client, guildId, userC, userC, activeFight.id);

    const storedPendingFight = await getFight(client, pendingFight.id);
    storedPendingFight.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await client.db.set(getFightKey(guildId, pendingFight.id), storedPendingFight);

    const storedActiveFight = await getFight(client, activeFight.id);
    storedActiveFight.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await client.db.set(getFightKey(guildId, activeFight.id), storedActiveFight);

    const results = await expirePendingFights(client);
    const [userABalance, userBBalance, userCBalance, userDBalance] = await Promise.all([
        getEconomyData(client, guildId, userA),
        getEconomyData(client, guildId, userB),
        getEconomyData(client, guildId, userC),
        getEconomyData(client, guildId, userD),
    ]);

    assert.equal(results.length, 2);
    assert.equal(userABalance.wallet, 10_000_000);
    assert.equal(userBBalance.wallet, 10_000_000);
    assert.equal(userCBalance.wallet, 12_000_000);
    assert.equal(userDBalance.wallet, 8_000_000);

    const refundedFight = await getFight(client, pendingFight.id);
    const completedFight = await getFight(client, activeFight.id);

    assert.equal(refundedFight.status, 'cancelled');
    assert.equal(completedFight.status, 'completed');
    assert.equal(completedFight.winner_id, userC);
    assert.equal(completedFight.reported_winner, userC);
});
