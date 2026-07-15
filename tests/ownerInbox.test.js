import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MessageFlags } from 'discord.js';
import communityModal from '../src/modules/interactions/modals/community_form.js';
import { handleOwnerInboxReply, OWNER_INBOX_GUILD_ID, OWNER_INBOX_USER_ID } from '../src/services/ownerInboxService.js';
import { communityCommand } from '../src/commands/community/factory.js';

function memoryClient({ dmFails = false } = {}) {
  const records = new Map(); let sequence = 0; const sent = [];
  const client = { db: { get: async (key, fallback = null) => records.has(key) ? records.get(key) : fallback,
    set: async (key, value) => { records.set(key, value); return true; }, increment: async () => ++sequence },
    users: { fetch: async id => ({ id, send: async payload => { if (dmFails) throw new Error('DM closed'); sent.push({ id, payload }); return { id: 'owner-message' }; } }) } };
  return { client, records, sent };
}
function modalInteraction(kind) {
  const form = kind === 'suggest' ? { title: 'רעיון חדש', description: 'פירוט עם https://example.com' }
    : { type: 'הטרדה', reported_user: '123', description: 'תיאור הדיווח', evidence: 'https://example.com/message' };
  let reply;
  return { interaction: { guildId: OWNER_INBOX_GUILD_ID, channelId: 'channel-1',
    guild: { name: 'EditIL', channels: { cache: new Collection() } }, channel: { name: 'general' },
    user: { id: 'user-1', username: 'sender', globalName: 'Sender' }, member: { displayName: 'Display' },
    fields: { getTextInputValue: id => form[id] || '' }, reply: async payload => { reply = payload; } }, get reply() { return reply; } };
}

for (const kind of ['suggest', 'report']) test(`${kind} in target guild is DMed and never posted publicly`, async () => {
  const ctx = memoryClient(), input = modalInteraction(kind);
  await communityModal.execute(input.interaction, ctx.client, [kind]);
  assert.equal(ctx.sent.length, 1); assert.equal(ctx.sent[0].id, OWNER_INBOX_USER_ID);
  assert.equal(input.reply.content, '✅ ההודעה שלך נשלחה בהצלחה לצוות השרת.');
  assert.equal(input.reply.flags, MessageFlags.Ephemeral);
  const caseId = kind === 'suggest' ? 'SUG-000001' : 'REP-000001';
  assert.equal(ctx.records.get(`owner_inbox:case:${caseId}`).authorId, 'user-1');
});

test('DM failure keeps the complete case pending in storage', async () => {
  const ctx = memoryClient({ dmFails: true }), input = modalInteraction('report');
  await communityModal.execute(input.interaction, ctx.client, ['report']);
  assert.equal(ctx.records.get('owner_inbox:case:REP-000001').deliveryStatus, 'pending');
  assert.match(input.reply.content, /תקלה זמנית/);
});

test('only the configured owner can reply to a stored case in DMs', async () => {
  const ctx = memoryClient(); ctx.records.set('owner_inbox:case:SUG-000001', { caseId:'SUG-000001', authorId:'user-1', replies:[] });
  let response; const message={ guild:null, content:'/reply SUG-000001 תודה על ההצעה', author:{id:OWNER_INBOX_USER_ID}, client:ctx.client, reply:async text=>{response=text;} };
  assert.equal(await handleOwnerInboxReply(message), true); assert.equal(ctx.sent[0].id, 'user-1');
  assert.equal(ctx.records.get('owner_inbox:case:SUG-000001').replies.length, 1); assert.match(response,/נשלחה בהצלחה/);
  assert.equal(await handleOwnerInboxReply({ ...message, author:{id:'someone-else'} }), false);
});

for (const name of ['suggest', 'report']) test(`${name} can open its modal without a verified role in the target guild`, async () => {
  const ctx=memoryClient();let modal;const interaction={guildId:OWNER_INBOX_GUILD_ID,commandName:name,
    inGuild:()=>true,guild:{ownerId:'owner'},user:{id:'unverified'},member:{permissions:{has:()=>false},roles:{cache:new Collection()}},
    options:{},showModal:async value=>{modal=value;},reply:async()=>{throw new Error('access was denied');}};
  await communityCommand(name).execute(interaction,ctx.client);
  assert.equal(modal.data.custom_id,`community_form:${name}`);
});
