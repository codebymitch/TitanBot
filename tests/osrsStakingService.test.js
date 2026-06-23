import test from 'node:test';
import assert from 'node:assert/strict';

import { getEconomyData, setEconomyData } from '../src/utils/economy.js';
import { getFight } from '../src/utils/database/fights.js';
import { getFightKey } from '../src/utils/database/keys.js';
import { getOsrsLink, linkOsrsUsername, createPendingOsrsLink, approvePendingOsrsLink } from '../src/utils/database/osrs.js';
import {
    expirePendingFights,
    handleFightAccept,
    handleFightChallenge,
    handleFightReport,
    handleFightResult,
    resolveFightDispute,
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

test('linkOsrsUsername stores unique guild-scoped OSRS links with linked status', async () => {
    const client = createClient();
    const guildId = '100000000000000001';
    const userOne = '200000000000000001';
    const userTwo = '200000000000000002';

    await linkOsrsUsername(client, guildId, userOne, 'The One KC');
    const stored = await getOsrsLink(client, guildId, userOne);

    assert.equal(stored.osrsUsername, 'The One KC');
    assert.equal(stored.status, 'linked');

    await assert.rejects(
        () => linkOsrsUsername(client, guildId, userTwo, 'the one kc'),
        /already linked/i,
    );
});

test('pending link request requires admin approval before fight eligibility', async () => {
    const client = createClient();
    const guildId = '100000000000000010';
    const userId = '200000000000000099';
    const opponentId = '200000000000000098';

    await Promise.all([
        seedWallet(client, guildId, userId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, opponentId, 'Opponent One'),
    ]);

    await createPendingOsrsLink(client, guildId, userId, 'PendingUser');
    const pendingLink = await getOsrsLink(client, guildId, userId);
    assert.equal(pendingLink.status, 'pending');

    await assert.rejects(
        () => handleFightChallenge(client, guildId, userId, opponentId, 1_000_000),
        /approv/i,
    );

    await approvePendingOsrsLink(client, guildId, userId, 'admin123');
    const approvedLink = await getOsrsLink(client, guildId, userId);
    assert.equal(approvedLink.status, 'linked');

    const fight = await handleFightChallenge(client, guildId, userId, opponentId, 1_000_000);
    assert.equal(fight.status, 'pending');
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

    const webhookResult = await resolveFightFromWebhook(client, guildId, 'Risky A', 'Risky B');
    assert.ok(webhookResult, 'Webhook should return a result');
    assert.equal(webhookResult.outcome, 'waiting', 'Should wait for opponent confirmation after webhook');

    // Opponent confirms their loss via /fight-results — should resolve the fight
    const confirmResult = await handleFightResult(client, guildId, opponentId, 'decline', fight.id);
    assert.equal(confirmResult.outcome, 'resolved', 'Fight should resolve when victim confirms via /fight-results');
    assert.equal(confirmResult.winnerId, challengerId);

    const [winnerBalance, loserBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(winnerBalance.wallet, 25_000_000);
    assert.equal(loserBalance.wallet, 15_000_000);
});

test('fight resolves when challenger accepts and opponent declines', async () => {
    const client = createClient();
    const guildId = '100000000000000005';
    const challengerId = '200000000000000051';
    const opponentId = '200000000000000052';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Fighter C'),
        linkOsrsUsername(client, guildId, opponentId, 'Fighter D'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 2_000_000);
    await handleFightAccept(client, guildId, fight.id, opponentId);

    const result1 = await handleFightResult(client, guildId, challengerId, 'accept', fight.id);
    assert.equal(result1.outcome, 'waiting', 'Should wait after first confirmation');

    const result2 = await handleFightResult(client, guildId, opponentId, 'decline', fight.id);
    assert.equal(result2.outcome, 'resolved', 'Should resolve when both confirm consistently');
    assert.equal(result2.winnerId, challengerId, 'Challenger should win when they accepted and opponent declined');

    const [winnerBalance, loserBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(winnerBalance.wallet, 12_000_000);
    assert.equal(loserBalance.wallet, 8_000_000);
});

test('fight creates dispute when both fighters claim to have won', async () => {
    const client = createClient();
    const guildId = '100000000000000006';
    const challengerId = '200000000000000061';
    const opponentId = '200000000000000062';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Fighter E'),
        linkOsrsUsername(client, guildId, opponentId, 'Fighter F'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 1_000_000);
    await handleFightAccept(client, guildId, fight.id, opponentId);

    await handleFightResult(client, guildId, challengerId, 'accept', fight.id);
    const result = await handleFightResult(client, guildId, opponentId, 'accept', fight.id);
    assert.equal(result.outcome, 'dispute', 'Both claiming win should create a dispute');

    const updatedFight = await getFight(client, fight.id);
    assert.equal(updatedFight.status, 'ticket_required');

    const [challengerBalance, opponentBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(challengerBalance.wallet, 9_000_000, 'Funds remain escrowed during dispute');
    assert.equal(opponentBalance.wallet, 9_000_000, 'Funds remain escrowed during dispute');
});

test('staff can resolve a fight dispute by paying the challenger', async () => {
    const client = createClient();
    const guildId = '100000000000000009';
    const challengerId = '200000000000000091';
    const opponentId = '200000000000000092';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Fighter I'),
        linkOsrsUsername(client, guildId, opponentId, 'Fighter J'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 1_000_000);
    await handleFightAccept(client, guildId, fight.id, opponentId);
    await handleFightResult(client, guildId, challengerId, 'accept', fight.id);
    await handleFightResult(client, guildId, opponentId, 'accept', fight.id);

    const resolvedFight = await resolveFightDispute(client, guildId, fight.id, 'pay_challenger', 'admin123');
    assert.equal(resolvedFight.status, 'completed');
    assert.equal(resolvedFight.winner_id, challengerId);
    assert.equal(resolvedFight.disputeResolution, 'pay_challenger');
    assert.equal(resolvedFight.disputeResolvedBy, 'admin123');
    assert.equal(resolvedFight.resolutionSource, 'staff_dispute');

    const [challengerBalance, opponentBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(challengerBalance.wallet, 11_000_000);
    assert.equal(opponentBalance.wallet, 9_000_000);
});

test('staff can resolve a fight dispute by refunding both fighters', async () => {
    const client = createClient();
    const guildId = '100000000000000011';
    const challengerId = '200000000000000101';
    const opponentId = '200000000000000102';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Fighter K'),
        linkOsrsUsername(client, guildId, opponentId, 'Fighter L'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 1_000_000);
    await handleFightAccept(client, guildId, fight.id, opponentId);
    await handleFightResult(client, guildId, challengerId, 'accept', fight.id);
    await handleFightResult(client, guildId, opponentId, 'accept', fight.id);

    const resolvedFight = await resolveFightDispute(client, guildId, fight.id, 'refund_both', 'admin456');
    assert.equal(resolvedFight.status, 'cancelled');
    assert.equal(resolvedFight.disputeResolution, 'refund_both');
    assert.equal(resolvedFight.disputeResolvedBy, 'admin456');
    assert.equal(resolvedFight.resolutionSource, 'staff_dispute');

    const [challengerBalance, opponentBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(challengerBalance.wallet, 10_000_000);
    assert.equal(opponentBalance.wallet, 10_000_000);
});

test('fight refunds both when both decline', async () => {
    const client = createClient();
    const guildId = '100000000000000007';
    const challengerId = '200000000000000071';
    const opponentId = '200000000000000072';

    await Promise.all([
        seedWallet(client, guildId, challengerId, 10_000_000),
        seedWallet(client, guildId, opponentId, 10_000_000),
        linkOsrsUsername(client, guildId, challengerId, 'Fighter G'),
        linkOsrsUsername(client, guildId, opponentId, 'Fighter H'),
    ]);

    const fight = await handleFightChallenge(client, guildId, challengerId, opponentId, 1_000_000);
    await handleFightAccept(client, guildId, fight.id, opponentId);

    await handleFightResult(client, guildId, challengerId, 'decline', fight.id);
    const result = await handleFightResult(client, guildId, opponentId, 'decline', fight.id);
    assert.equal(result.outcome, 'refunded', 'Both declining should refund both fighters');

    const [challengerBalance, opponentBalance] = await Promise.all([
        getEconomyData(client, guildId, challengerId),
        getEconomyData(client, guildId, opponentId),
    ]);
    assert.equal(challengerBalance.wallet, 10_000_000, 'Both should be refunded');
    assert.equal(opponentBalance.wallet, 10_000_000, 'Both should be refunded');
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

test('expirePendingFights skips ticket_required fights', async () => {
    const client = createClient();
    const guildId = '100000000000000008';
    const userA = '200000000000000081';
    const userB = '200000000000000082';

    await Promise.all([
        seedWallet(client, guildId, userA, 10_000_000),
        seedWallet(client, guildId, userB, 10_000_000),
        linkOsrsUsername(client, guildId, userA, 'Ticket A'),
        linkOsrsUsername(client, guildId, userB, 'Ticket B'),
    ]);

    const fight = await handleFightChallenge(client, guildId, userA, userB, 1_000_000);
    await handleFightAccept(client, guildId, fight.id, userB);
    await handleFightResult(client, guildId, userA, 'accept', fight.id);
    const result = await handleFightResult(client, guildId, userB, 'accept', fight.id);
    assert.equal(result.outcome, 'dispute');

    const storedFight = await getFight(client, fight.id);
    storedFight.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await client.db.set(getFightKey(guildId, fight.id), storedFight);

    const expiredResults = await expirePendingFights(client);
    assert.equal(expiredResults.length, 0, 'Dispute fight should not be expired/refunded');

    const [balanceA, balanceB] = await Promise.all([
        getEconomyData(client, guildId, userA),
        getEconomyData(client, guildId, userB),
    ]);
    assert.equal(balanceA.wallet, 9_000_000, 'Funds still escrowed for dispute fight');
    assert.equal(balanceB.wallet, 9_000_000, 'Funds still escrowed for dispute fight');
});
