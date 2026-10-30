import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { earningMembers, rankVoiceMinutes, rollVoiceXp, tickVoiceActivity, voiceMinutesKey } from '../src/services/leveling/voiceXp.js';
import { formatVoiceTime, buildTopVoiceEmbed, buildRankEmbed } from '../src/services/leveling/levelUi.js';
import { transferCC, transferTaxPercent, transferTax, grantCC, getProfile } from '../src/services/cc/ccService.js';
import { applyWordAliases, resolveCommandAlias } from '../src/config/commands/commandAliases.js';
import { getUserLevelKey } from '../src/utils/database/keys.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import giveCommand from '../src/commands/Games/give.js';
import leaderboardCommand from '../src/commands/Leveling/leaderboard.js';

const GUILD = '100000000000000001';
const A = '200000000000000001';
const B = '200000000000000002';
const C = '200000000000000003';

function fakeClient(guilds = []) {
    const store = new Map();
    return {
        store,
        guilds: { cache: new Map(guilds.map((guild) => [guild.id, guild])) },
        db: {
            get: async (key, fallback = null) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
            set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
            list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
        },
    };
}

const voiceMember = (id, voice = {}, { bot = false } = {}) => ({
    id, voice, user: { id, bot, tag: `user${id}` }, roles: { cache: new Map() }, toString: () => `<@${id}>`,
});
const voiceChannel = (id, members) => ({ id, isVoiceBased: () => true, members: new Map(members.map((m) => [m.id, m])) });

describe('voice XP', () => {
    test('only unmuted members who are not alone earn', () => {
        const talking = voiceMember(A);
        const muted = voiceMember(B, { selfMute: true });
        assert.deepEqual(earningMembers(voiceChannel('v', [talking, muted])).map((m) => m.id), [A]);
        // Alone, or only with a bot or a deafened member: nobody can hear them.
        assert.deepEqual(earningMembers(voiceChannel('v', [talking])), []);
        assert.deepEqual(earningMembers(voiceChannel('v', [talking, voiceMember(C, {}, { bot: true })])), []);
        assert.deepEqual(earningMembers(voiceChannel('v', [talking, voiceMember(C, { selfDeaf: true })])), []);
        // Server mute and stage listeners don't earn; the AFK channel never does.
        assert.deepEqual(earningMembers(voiceChannel('v', [talking, voiceMember(B, { serverMute: true })])).map((m) => m.id), [A]);
        assert.deepEqual(earningMembers(voiceChannel('v', [talking, voiceMember(B, { suppress: true })])).map((m) => m.id), [A]);
        assert.deepEqual(earningMembers(voiceChannel('afk', [talking, voiceMember(B)]), { afkChannelId: 'afk' }), []);
    });

    test('voice XP range and multiplier', () => {
        assert.equal(rollVoiceXp({}, () => 0), 8);
        assert.equal(rollVoiceXp({}, () => 0.999), 12);
        assert.equal(rollVoiceXp({ xpMultiplier: 2 }, () => 0), 16);
    });

    test('a tick counts a minute and gives XP without touching the chat cooldown', async () => {
        const a = voiceMember(A);
        const b = voiceMember(B, { selfMute: true });
        const guild = { id: GUILD, afkChannelId: null, channels: { cache: new Map([['v', voiceChannel('v', [a, b])]]) } };
        const client = fakeClient([guild]);
        client.store.set(`guild:${GUILD}:config`, { leveling: { enabled: true } });
        await tickVoiceActivity(client);
        await tickVoiceActivity(client);
        assert.deepEqual(client.store.get(voiceMinutesKey(GUILD)), { [A]: 2 });
        const level = client.store.get(getUserLevelKey(GUILD, A));
        assert.ok(level.totalXp >= 16 && level.totalXp <= 24);
        assert.equal(level.lastMessage, 0);
        assert.equal(client.store.get(getUserLevelKey(GUILD, B)), undefined);
    });

    test('top voice and the rank card show the time', () => {
        assert.equal(formatVoiceTime(40), '40د');
        assert.equal(formatVoiceTime(125), '2س 5د');
        assert.equal(formatVoiceTime(120), '2س');
        const ranked = rankVoiceMinutes({ [A]: 30, [B]: 90, [C]: 0 });
        assert.deepEqual(ranked.map((e) => [e.userId, e.rank]), [[B, 1], [A, 2]]);
        const top = buildTopVoiceEmbed({ name: 'void' }, ranked, { callerId: A, callerEntry: ranked[1] });
        assert.match(top.description, /🥇 <@200000000000000002> — \*\*1س 30د\*\*/u);
        assert.match(top.description, /ترتيبك:\*\* #2 — 30د/u);
        const card = buildRankEmbed({ displayName: 'x', displayAvatarURL: () => '' }, { level: 1, xp: 0, totalXp: 0, xpNeeded: 100, position: null, rankedCount: 0, voiceMinutes: 75 });
        assert.ok(card.fields.some((field) => field.value === '**1س 15د**'));
    });

    test('top voice aliases', () => {
        assert.deepEqual(applyWordAliases('توب', ['فويس'], false), { commandName: 'leaderboard', args: ['voice'] });
        assert.deepEqual(applyWordAliases('top', ['voice'], true), { commandName: 'leaderboard', args: ['voice'] });
        assert.equal(mapArgumentsToOptions(['voice'], leaderboardCommand.data).getString('type'), 'voice');
    });
});

describe('give (CC transfer)', () => {
    test('the tax is 5% for the first 3 transfers of the week, then grows by 5% up to 50%', () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(transferTaxPercent), [5, 5, 5, 10, 15, 20]);
        assert.equal(transferTaxPercent(100), 50);
        assert.equal(transferTax(100, 5), 5);
        assert.equal(transferTax(10, 5), 1);
        assert.equal(transferTax(101, 5), 6);
    });

    test('moves CC, takes the tax from what arrives, and raises it with each transfer in 7 days', async () => {
        const client = fakeClient();
        await grantCC(client, GUILD, A, 1000);
        const day = 24 * 60 * 60 * 1000;
        const start = Date.UTC(2026, 0, 1);

        const results = [];
        for (let i = 0; i < 5; i += 1) results.push(await transferCC(client, GUILD, A, B, 100, { now: start + i * 1000 }));
        assert.deepEqual(results.map((r) => r.taxPercent), [5, 5, 5, 10, 15]);
        assert.deepEqual(results.map((r) => r.received), [95, 95, 95, 90, 85]);
        assert.equal(results[4].nextTaxPercent, 20);
        assert.equal((await getProfile(client, GUILD, A)).cc, 500);
        const b = await getProfile(client, GUILD, B);
        assert.equal(b.cc, 460);
        assert.equal(b.stats.received, 460);
        assert.equal(b.stats.earned, 0);

        // A week after the first transfers they stop counting.
        const later = await transferCC(client, GUILD, A, B, 100, { now: start + 7 * day + 10_000 });
        assert.equal(later.taxPercent, 5);
    });

    test('refuses self, too little and more than the balance', async () => {
        const client = fakeClient();
        await grantCC(client, GUILD, A, 50);
        assert.equal((await transferCC(client, GUILD, A, A, 20)).reason, 'self');
        assert.equal((await transferCC(client, GUILD, A, B, 5)).reason, 'bad_amount');
        assert.deepEqual(await transferCC(client, GUILD, A, B, 60), { ok: false, reason: 'no_cc', skipSave: true, balance: 50 });
        assert.equal((await getProfile(client, GUILD, A)).cc, 50);
    });

    test('give aliases', () => {
        assert.equal(resolveCommandAlias('تحويل'), 'give');
        const aliased = applyWordAliases('تحويل', ['<@123456789012345678>', '100'], false);
        const options = mapArgumentsToOptions(aliased.args, giveCommand.data);
        assert.equal(options.getUser('user'), '<@123456789012345678>');
        assert.equal(options.getInteger('amount'), 100);
        assert.deepEqual(applyWordAliases('cc', ['give', '<@1>', '100'], true), { commandName: 'give', args: ['<@1>', '100'] });
        // Everyday word in a sentence is not a command.
        assert.equal(applyWordAliases('حول', ['البيت'], false), null);
    });
});

describe('CC event (boost)', () => {
    test('multiplies game rewards and caps until it ends, then goes back to normal by itself', async () => {
        const { CC, ccBoost, ccBoostLine } = await import('../src/config/cc.js');
        const { groupRewards, soloRewardLeft, awardGamesBotWin } = await import('../src/services/cc/ccService.js');
        const saved = CC.boost;
        CC.boost = { multiplier: 5, until: '2026-09-30T08:15:00Z' };
        try {
            const during = Date.parse('2026-09-27T12:00:00Z');
            const after = Date.parse('2026-09-30T08:15:00Z');
            assert.equal(ccBoost(during), 5);
            assert.equal(ccBoost(after), 1);
            assert.match(ccBoostLine(during), /CC ×5.*<t:\d+:R>/u);
            assert.equal(ccBoostLine(after), '');

            assert.deepEqual(groupRewards(10, { now: during }), [250, 150, 100]);
            assert.deepEqual(groupRewards(10, { now: after }), [50, 30, 20]);
            assert.equal(soloRewardLeft(0, { now: during }), CC.solo.win * 5);
            assert.equal(soloRewardLeft(CC.solo.boostDailyCap - 2, { now: during }), 2);
            assert.equal(soloRewardLeft(CC.solo.boostDailyCap, { now: during }), 0);
            assert.equal(soloRewardLeft(CC.solo.boostDailyCap, { now: after }), CC.solo.win);

            const client = fakeClient();
            const win = await awardGamesBotWin(client, GUILD, A, { now: during });
            assert.deepEqual([win.amount, win.boost], [CC.gamesBot.win * 5, 5]);
            const normal = await awardGamesBotWin(client, GUILD, B, { now: after });
            assert.deepEqual([normal.amount, normal.boost], [CC.gamesBot.win, 1]);
        } finally {
            CC.boost = saved;
        }
    });

    test('solo wins stop at the flat event cap and reset the next day', async () => {
        const { CC } = await import('../src/config/cc.js');
        const { awardSoloWin } = await import('../src/services/cc/ccService.js');
        const saved = CC.boost;
        CC.boost = { multiplier: 5, until: '2026-09-30T08:15:00Z' };
        try {
            const client = fakeClient();
            const day = Date.parse('2026-09-27T12:00:00Z');
            let total = 0;
            for (let i = 0; i < 70; i += 1) total += (await awardSoloWin(client, GUILD, A, 'slots', { now: day })).amount;
            assert.equal(total, CC.solo.boostDailyCap);
            const tomorrow = await awardSoloWin(client, GUILD, A, 'slots', { now: day + 24 * 60 * 60 * 1000 });
            assert.equal(tomorrow.amount, CC.solo.win * 5);
        } finally {
            CC.boost = saved;
        }
    });

    test('transfers are never multiplied', async () => {
        const client = fakeClient();
        await grantCC(client, GUILD, A, 100);
        const result = await transferCC(client, GUILD, A, B, 100);
        assert.equal(result.received, 95);
    });
});

describe('level-up CC', () => {
    test('pays 10 CC × the new level, for every level gained', async () => {
        const { CC } = await import('../src/config/cc.js');
        const { levelUpReward } = await import('../src/services/cc/ccService.js');
        const saved = CC.boost;
        CC.boost = { multiplier: 1, until: null };
        try {
            assert.equal(levelUpReward(0, 1), 10);
            assert.equal(levelUpReward(9, 10), 100);
            assert.equal(levelUpReward(3, 5), 40 + 50);
            assert.equal(levelUpReward(5, 5), 0);
            CC.boost = { multiplier: 5, until: '2999-01-01T00:00:00Z' };
            assert.equal(levelUpReward(9, 10), 500);
        } finally {
            CC.boost = saved;
        }
    });

    test('leveling up through XP pays CC and the level-up message shows it', async () => {
        const { CC } = await import('../src/config/cc.js');
        const { addXp } = await import('../src/services/leveling/xpSystem.js');
        const saved = CC.boost;
        CC.boost = { multiplier: 1, until: null };
        try {
            const client = fakeClient();
            const guild = { id: GUILD, name: 'void', channels: { cache: new Map(), fetch: async () => null } };
            const member = voiceMember(A);
            // Level 0 → 1 needs 50 XP, 1 → 2 needs 105.
            const result = await addXp(client, guild, member, 200);
            assert.equal(result.level, 2);
            assert.equal((await getProfile(client, GUILD, A)).cc, 10 + 20);
        } finally {
            CC.boost = saved;
        }

        const { buildLevelUpMessage } = await import('../src/services/leveling/levelUi.js');
        const shown = { id: A, displayName: 'x', toString: () => `<@${A}>`, displayAvatarURL: () => '' };
        const message = buildLevelUpMessage(shown, { fromLevel: 6, level: 7, xp: 0, xpNeeded: 400, ccReward: 350, ccBoost: 5 });
        assert.match(message.embeds[0].description, /\+350 CC\*\* 🔥 \(×5\)/u);
    });
});
