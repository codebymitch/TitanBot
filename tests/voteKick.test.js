import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import {
  VOTE_KICK, votesRequired, startVoteKick, castVote, voteKickPayload, kickFromVoice, handleVoteKickVoiceState,
  sweepVoteKickBlocks, expireVote,
} from '../src/services/voice/voteKickService.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';
import votekick from '../src/commands/Community/votekick.js';

const VOICE = '700000000000000001';
let nextUser = 1;

function fakeClient() {
  const store = new Map();
  return { store, db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } };
}

function setup({ guildId = HOME_GUILD_ID, count = 4, voiceChat = true } = {}) {
  const members = new Map();
  const overwrites = new Map();
  const edits = [];
  const channel = {
    id: VOICE, name: '🎮 Among Us - 27',
    isVoiceBased: () => voiceChat,
    members,
    permissionOverwrites: {
      cache: overwrites,
      edit: async (userId, perms) => {
        edits.push([userId, perms]);
        if (perms.Connect === false) overwrites.set(userId, { allow: { bitfield: 0n }, deny: { bitfield: 1n }, delete: async () => overwrites.delete(userId) });
        else overwrites.set(userId, { allow: { bitfield: 0n }, deny: { bitfield: 0n }, delete: async () => overwrites.delete(userId) });
      },
    },
  };
  const guildMembers = new Map();
  const guild = { id: guildId, members: { cache: guildMembers, fetch: async (id) => guildMembers.get(id) || null }, channels: { cache: new Map([[VOICE, channel]]) } };
  const make = ({ staff = false } = {}) => {
    const id = `2000000000000${String(nextUser++).padStart(5, '0')}`;
    const member = {
      id, user: { id, bot: false },
      permissions: { has: (flag) => staff && flag === PermissionFlagsBits.MoveMembers },
      voice: { channelId: VOICE, disconnect: async () => { member.voice.channelId = null; members.delete(id); member.disconnected = true; } },
    };
    members.set(id, member);
    guildMembers.set(id, member);
    return member;
  };
  const people = Array.from({ length: count }, () => make());
  return { guild, channel, people, make, edits, overwrites };
}

describe('vote kick in a voice channel (reports #183, #185)', () => {
  test('needs half of the others, at least 2: 12 in the channel → 5', () => {
    assert.equal(votesRequired(12), 5);
    assert.equal(votesRequired(3), 2);
    assert.equal(votesRequired(4), 2);
  });

  test('a vote that passes disconnects the member and keeps them out of the channel', async () => {
    const client = fakeClient();
    const { guild, channel, people, edits, overwrites } = setup({ count: 5 });
    const [starter, voter, other, target] = people;
    const started = startVoteKick({ guild, channel, starter, target, reason: 'بيخرب اللعبة', now: 1_000 });
    assert.equal(started.ok, true);
    const { vote } = started;
    assert.equal(vote.required, 2);
    assert.equal(vote.yes.size, 1);

    const payload = voteKickPayload(vote);
    for (const person of people) assert.ok(payload.content.includes(`<@${person.id}>`));
    assert.match(payload.embeds[0].description, /Among Us - 27/u);
    assert.match(payload.embeds[0].description, /بيخرب اللعبة/u);

    assert.equal(castVote(vote.id, target, 'yes', 2_000).reason, 'target');
    assert.equal(castVote(vote.id, starter, 'yes', 2_000).reason, 'already');
    const outsider = { id: '299999999999999999', voice: { channelId: null } };
    assert.equal(castVote(vote.id, outsider, 'yes', 2_000).reason, 'not_in_channel');
    const passed = castVote(vote.id, voter, 'yes', 2_000);
    assert.equal(passed.passed, true);
    assert.equal(castVote(vote.id, other, 'yes', 2_000).reason, 'ended');

    const kicked = await kickFromVoice(client, guild, channel, target.id, { now: 3_000 });
    assert.deepEqual(kicked, { disconnected: true, denied: true });
    assert.deepEqual(edits[0], [target.id, { Connect: false }]);
    assert.equal(target.disconnected, true);

    // Joining again disconnects them.
    target.disconnected = false;
    const rejoin = { guild, id: target.id, channelId: VOICE, member: target, disconnect: async () => { target.disconnected = true; } };
    assert.equal(await handleVoteKickVoiceState(client, { guild, channelId: null, channel: null }, rejoin, 4_000), true);
    assert.equal(target.disconnected, true);
    // Someone else joins freely.
    const newcomer = { guild, id: '288888888888888888', channelId: VOICE, member: { user: { bot: false } }, disconnect: async () => { throw new Error('must not'); } };
    assert.equal(await handleVoteKickVoiceState(client, { guild, channelId: null, channel: null }, newcomer, 4_000), false);

    // The block stays while the game goes on, and lifts when the channel empties.
    assert.equal(await sweepVoteKickBlocks(client, guild, 5_000), 0);
    channel.members.clear();
    assert.equal(await sweepVoteKickBlocks(client, guild, 6_000), 1);
    assert.equal(overwrites.has(target.id), false);
    assert.equal(await handleVoteKickVoiceState(client, { guild, channelId: null, channel: null }, rejoin, 7_000), false);
  });

  test('looks like the Among Us bot: ✅ and ❌ with their counts; ❌ reaching the count ends it, and a vote can change', () => {
    const { guild, channel, people } = setup({ count: 7 });
    const [starter, a, b, c, d, target] = people;
    const { vote } = startVoteKick({ guild, channel, starter, target, now: 100_000 });
    assert.equal(vote.required, 3);
    const buttons = () => voteKickPayload(vote).components[0].toJSON().components;
    assert.deepEqual(buttons().map((button) => [button.emoji.name, button.label, button.style]), [['✅', '1 / 3', 3], ['❌', '0 / 3', 4]]);
    const text = voteKickPayload(vote).embeds[0].description;
    assert.match(text, /الأصوات المطلوبة:\*\* `3`/u);
    assert.match(text, /السبب:\*\* `من غير سبب`/u);

    assert.equal(castVote(vote.id, a, 'no', 101_000).ok, true);
    assert.equal(castVote(vote.id, a, 'no', 101_000).reason, 'already');
    // Changing a vote moves it.
    assert.equal(castVote(vote.id, a, 'yes', 101_000).ok, true);
    assert.deepEqual([vote.yes.size, vote.no.size], [2, 0]);
    castVote(vote.id, a, 'no', 101_000);
    castVote(vote.id, b, 'no', 101_000);
    const failed = castVote(vote.id, c, 'no', 101_000);
    assert.deepEqual([failed.passed, failed.failed], [false, true]);
    assert.equal(castVote(vote.id, d, 'yes', 101_000).reason, 'ended');
    assert.ok(buttons().every((button) => button.disabled));
  });

  test('a block runs out after an hour at most', async () => {
    const client = fakeClient();
    const { guild, channel, people } = setup({ count: 3 });
    await kickFromVoice(client, guild, channel, people[2].id, { now: 0 });
    assert.equal(await sweepVoteKickBlocks(client, guild, VOTE_KICK.blockMs - 1), 0);
    assert.equal(await sweepVoteKickBlocks(client, guild, VOTE_KICK.blockMs), 1);
  });

  test('refuses: outside the voice chat, too few members, staff, self, a second vote, too soon', () => {
    const notVoice = setup({ voiceChat: false });
    assert.equal(startVoteKick({ guild: notVoice.guild, channel: notVoice.channel, starter: notVoice.people[0], target: notVoice.people[1] }).reason, 'not_voice_chat');

    const two = setup({ count: 2 });
    assert.equal(startVoteKick({ guild: two.guild, channel: two.channel, starter: two.people[0], target: two.people[1] }).reason, 'too_few');

    const room = setup({ count: 4 });
    const staff = room.make({ staff: true });
    const [a, b, c] = room.people;
    assert.equal(startVoteKick({ guild: room.guild, channel: room.channel, starter: a, target: staff }).reason, 'protected');
    assert.equal(startVoteKick({ guild: room.guild, channel: room.channel, starter: a, target: a }).reason, 'self');
    assert.equal(startVoteKick({ guild: room.guild, channel: room.channel, starter: a, target: { id: '1', voice: { channelId: 'x' } } }).reason, 'target_missing');
    const first = startVoteKick({ guild: room.guild, channel: room.channel, starter: a, target: b, now: 10_000 });
    assert.equal(first.ok, true);
    assert.equal(startVoteKick({ guild: room.guild, channel: room.channel, starter: c, target: b, now: 10_000 }).reason, 'running');
    expireVote(first.vote.id);
    assert.equal(startVoteKick({ guild: room.guild, channel: room.channel, starter: a, target: c, now: 20_000 }).reason, 'cooldown');
  });

  test('another server: no vote, and joining a voice channel is left alone', async () => {
    const other = setup({ guildId: '100000000000000099' });
    assert.equal(startVoteKick({ guild: other.guild, channel: other.channel, starter: other.people[0], target: other.people[1] }).reason, 'not_home');
    const state = { guild: other.guild, id: other.people[1].id, channelId: VOICE, member: other.people[1], disconnect: async () => { throw new Error('must not'); } };
    assert.equal(await handleVoteKickVoiceState(fakeClient(), { guild: other.guild, channelId: null }, state), false);

    const replies = [];
    const interaction = { id: '1', user: { id: '2' }, guildId: '100000000000000099', reply: async (payload) => replies.push(payload), isRepliable: () => true, replied: false, deferred: false };
    await votekick.execute(interaction);
    assert.match(JSON.stringify(replies), /مش متاح/u);
  });

  test('`فوت كيك @member` runs the command', () => {
    assert.deepEqual(applyWordAliases('فوت', ['كيك', '<@200000000000000001>', 'سبام'], false), { commandName: 'votekick', args: ['<@200000000000000001>', 'سبام'] });
    assert.equal(votekick.data.name, 'votekick');
  });
});
