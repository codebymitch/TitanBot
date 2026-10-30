import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ensurePlayer } from '../src/services/music/musicActions.js';

const BOT_ROOM = '500000000000000001';
const OTHER_ROOM = '500000000000000002';

function setup({ memberRoom, listeners = 1 }) {
  const player = { voiceChannel: BOT_ROOM, setVolume() {}, setVoiceChannel(id) { this.voiceChannel = id; } };
  const humans = new Map(Array.from({ length: listeners }, (_, i) => [String(i), { user: { bot: false } }]));
  humans.filter = (fn) => { const out = new Map([...humans].filter(([, m]) => fn(m))); return out; };
  const client = { riffy: { nodeMap: new Map([['n', { connected: true }]]), players: new Map([['g', player]]) } };
  const interaction = {
    guild: { id: 'g', channels: { cache: new Map([[BOT_ROOM, { members: humans }]]) } },
    channel: { id: 'text' },
    member: { voice: { channel: memberRoom ? { id: memberRoom } : null } },
  };
  return { client, interaction, player };
}

describe('music: only people in the bot\'s voice room can play (report #114)', () => {
  test('someone not in voice is refused', async () => {
    const { client, interaction } = setup({ memberRoom: null });
    await assert.rejects(ensurePlayer(client, interaction), /Not in voice channel/u);
  });

  test('someone in another room is refused while people listen to the bot', async () => {
    const { client, interaction, player } = setup({ memberRoom: OTHER_ROOM, listeners: 2 });
    await assert.rejects(ensurePlayer(client, interaction), /Wrong voice channel/u);
    assert.equal(player.voiceChannel, BOT_ROOM);
  });

  test('someone in the bot\'s room can play', async () => {
    const { client, interaction } = setup({ memberRoom: BOT_ROOM });
    assert.ok((await ensurePlayer(client, interaction)).player);
  });

  test('when the bot\'s room is empty, a member in another room takes the bot there', async () => {
    const { client, interaction, player } = setup({ memberRoom: OTHER_ROOM, listeners: 0 });
    await ensurePlayer(client, interaction);
    assert.equal(player.voiceChannel, OTHER_ROOM);
  });
});
