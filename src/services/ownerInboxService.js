import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

export const OWNER_INBOX_GUILD_ID = '1526671786387705907';
export const OWNER_INBOX_USER_ID = '1127099544560205914';

const caseKey = caseId => `owner_inbox:case:${caseId}`;
const sequenceKey = kind => `owner_inbox:sequence:${kind}`;
const prefix = kind => kind === 'suggest' ? 'SUG' : 'REP';
const line = value => value?.trim() || 'לא צוין';

async function nextSequence(client, kind) {
  if (client.db?.isAvailable?.() && client.db.db?.pool) {
    const { pgConfig } = await import('../config/postgres.js');
    const result = await client.db.db.pool.query(
      `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at)
       VALUES ($1, '1'::jsonb, NULL)
       ON CONFLICT (key) DO UPDATE
       SET value = to_jsonb(COALESCE((${pgConfig.tables.temp_data}.value #>> '{}')::bigint, 0) + 1), expires_at = NULL
       RETURNING value`, [sequenceKey(kind)]
    );
    return Number(result.rows[0].value);
  }
  return client.db.increment(sequenceKey(kind));
}

export function isOwnerInboxSubmission(guildId, kind) {
  return guildId === OWNER_INBOX_GUILD_ID && (kind === 'suggest' || kind === 'report');
}

export async function createOwnerInboxCase(client, interaction, kind, data) {
  const sequence = await nextSequence(client, kind);
  const caseId = `${prefix(kind)}-${String(sequence).padStart(6, '0')}`;
  const createdAt = new Date().toISOString();
  const record = {
    caseId, kind, guildId: interaction.guildId, channelId: interaction.channelId,
    authorId: interaction.user.id, data, createdAt, deliveryStatus: 'pending', replies: [],
    context: { username: interaction.user.username, displayName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
      guildName: interaction.guild.name, channelName: interaction.channel?.name || 'לא ידוע' }
  };
  await client.db.set(caseKey(caseId), record);
  logger.info(kind === 'suggest' ? 'Suggestion received' : 'Report received', { caseId, guildId: interaction.guildId, authorId: interaction.user.id });
  return record;
}

export function buildOwnerInboxEmbed(record) {
  const { kind, data, caseId, createdAt } = record;
  const sender = `• Username: ${record.context.username}\n• Display Name: ${record.context.displayName}\n• Mention: <@${record.authorId}>\n• User ID: \`${record.authorId}\``;
  const fields = [{ name: kind === 'suggest' ? '👤 שולח' : '👤 המדווח', value: sender }];
  if (kind === 'suggest') fields.push(
    { name: '📝 כותרת', value: line(data.title) },
    { name: '📄 פירוט', value: line(data.description) }
  );
  else fields.push(
    { name: '👤 המשתמש שדווח', value: line(data.reported_user) },
    { name: '📂 סוג הדיווח', value: line(data.type) },
    { name: '📄 תיאור', value: line(data.description) },
    { name: '🔗 קישור', value: line(data.evidence) }
  );
  fields.push(
    { name: '🏠 שרת', value: `${record.context.guildName}\n\`${record.guildId}\``, inline: true },
    { name: '📍 ערוץ', value: `${record.context.channelName}\n\`${record.channelId}\``, inline: true },
    { name: '🕒 זמן', value: `<t:${Math.floor(new Date(createdAt).getTime() / 1000)}:F>` },
    { name: '🆔 Case ID', value: `\`${caseId}\`` }
  );
  const urls = Object.values(data).flatMap(value => typeof value === 'string' ? value.match(/https?:\/\/\S+/gi) || [] : []);
  if (urls.length) fields.push({ name: '🔗 קישורים שצורפו', value: urls.slice(0, 5).join('\n') });
  return new EmbedBuilder().setColor(kind === 'report' ? 0xED4245 : 0x5865F2)
    .setTitle(kind === 'suggest' ? '💡 הצעה חדשה' : '🚨 דיווח חדש').addFields(fields).setTimestamp(new Date(createdAt));
}

export async function deliverOwnerInboxCase(client, record) {
  try {
    const owner = await client.users.fetch(OWNER_INBOX_USER_ID);
    const message = await owner.send({ embeds: [buildOwnerInboxEmbed(record)], allowedMentions: { parse: [] } });
    const delivered = { ...record, deliveryStatus: 'delivered', ownerMessageId: message.id, deliveredAt: new Date().toISOString() };
    await client.db.set(caseKey(record.caseId), delivered);
    logger.info('DM delivered', { caseId: record.caseId, ownerMessageId: message.id });
    return true;
  } catch (error) {
    await client.db.set(caseKey(record.caseId), { ...record, deliveryStatus: 'pending', deliveryError: error.code || error.message });
    logger.error('DM failed', { caseId: record.caseId, error: error.stack || error.message });
    return false;
  }
}

export async function retryPendingOwnerInboxCases(client) {
  if (typeof client.db?.isAvailable === 'function' && !client.db.isAvailable()) return;
  const keys = await client.db.list('owner_inbox:case:');
  for (const key of keys) {
    const record = await client.db.get(key);
    if (record?.deliveryStatus !== 'pending') continue;
    await deliverOwnerInboxCase(client, record);
  }
}

export async function handleOwnerInboxReply(message) {
  if (message.author.id !== OWNER_INBOX_USER_ID || message.guild || !message.content.startsWith('/reply ')) return false;
  const match = /^\/reply\s+((?:SUG|REP)-\d{6})\s+([\s\S]+)$/i.exec(message.content.trim());
  if (!match) {
    await message.reply('שימוש נכון: `/reply CASE-ID תוכן התגובה`');
    return true;
  }
  const caseId = match[1].toUpperCase(), replyText = match[2].trim();
  const record = await message.client.db.get(caseKey(caseId));
  if (!record) { await message.reply('מזהה המקרה לא נמצא.'); return true; }
  try {
    const user = await message.client.users.fetch(record.authorId);
    await user.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📩 תגובה מצוות EditIL')
      .addFields({ name: '🆔 Case ID', value: `\`${caseId}\`` }, { name: '💬 תגובת הצוות', value: replyText },
        { name: '🕒 זמן', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }).setTimestamp()], allowedMentions: { parse: [] } });
    record.replies = [...(record.replies || []), { authorId: message.author.id, content: replyText, createdAt: new Date().toISOString() }];
    await message.client.db.set(caseKey(caseId), record);
    logger.info('Owner replied', { caseId, recipientId: record.authorId });
    await message.reply(`התגובה למקרה \`${caseId}\` נשלחה בהצלחה.`);
  } catch (error) {
    logger.error('Owner reply failed', { caseId, error: error.stack || error.message });
    await message.reply('שליחת התגובה נכשלה. המקרה נשמר במסד הנתונים.');
  }
  return true;
}
