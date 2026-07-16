import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import crypto from 'crypto';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export const STAFF_APPLICATION_GUILD_ID = '1526671786387705907';
export const STAFF_APPLICATION_CATEGORY_ID = '1526687081848504442';
export const STAFF_APPLICATION_CHANNEL_NAME = 'staff-applications';
const API_BASE = 'https://editil.itay-kman.workers.dev/api/staff-applications';
const INTERVAL_MS = 20_000;
const secret = client => crypto.createHash('sha256').update(`${client.config.bot.token}:editil-status`).digest('hex');
const key = id => `staffapp:${id}`;

function privateChannelOverwrites(guild, category) {
  const inherited = category.permissionOverwrites.cache.map(overwrite => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield
  }));
  const upsert = (id, overwrite) => {
    const index = inherited.findIndex(item => item.id === id);
    if (index >= 0) inherited[index] = { ...inherited[index], ...overwrite };
    else inherited.push({ id, ...overwrite });
  };
  upsert(guild.id, { allow: [], deny: [PermissionFlagsBits.ViewChannel] });
  upsert(guild.members.me.id, {
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
    deny: []
  });
  return inherited;
}

async function ensureStaffApplicationChannel(client) {
  const guild = client.guilds.cache.get(STAFF_APPLICATION_GUILD_ID);
  const category = guild?.channels.cache.get(STAFF_APPLICATION_CATEGORY_ID);
  if (!guild || category?.type !== ChannelType.GuildCategory) throw new Error('Staff application category is unavailable');
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Missing ManageChannels for staff applications');

  const overwrites = privateChannelOverwrites(guild, category);
  let channel = guild.channels.cache.find(candidate =>
    candidate.type === ChannelType.GuildText && candidate.parentId === category.id && candidate.name === STAFF_APPLICATION_CHANNEL_NAME
  );
  if (!channel) {
    channel = await guild.channels.create({ name: STAFF_APPLICATION_CHANNEL_NAME, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: 'Private staff application inbox' });
  } else {
    await channel.permissionOverwrites.set(overwrites, 'Keep staff application inbox private');
  }
  return channel;
}

async function consolidateLegacyApplicationChannels(client) {
  try {
    const inbox = await ensureStaffApplicationChannel(client);
    const legacyChannels = inbox.guild.channels.cache.filter(channel =>
      channel.type === ChannelType.GuildText && channel.parentId === STAFF_APPLICATION_CATEGORY_ID && channel.name.startsWith('staff-app-') && channel.id !== inbox.id
    );
    for (const channel of legacyChannels.values()) {
      try {
        const memberOverwrites = channel.permissionOverwrites.cache.filter(overwrite => overwrite.type === OverwriteType.Member && overwrite.id !== client.user.id);
        await Promise.all(memberOverwrites.map(overwrite => overwrite.delete('Remove applicant access before consolidation')));
        const messages = await channel.messages.fetch({ limit: 100 });
        const applicationMessages = [...messages.values()].filter(message => message.author.id === client.user.id && message.embeds.length).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        for (const message of applicationMessages) await inbox.send({ embeds: message.embeds.map(embed => embed.toJSON()), allowedMentions: { parse: [] } });
        await channel.delete('Consolidated into the private staff application inbox');
        logger.info('Legacy staff application channel consolidated', { channelId: channel.id, inboxChannelId: inbox.id });
      } catch (error) {
        const memberOverwrites = channel.permissionOverwrites.cache.filter(overwrite => overwrite.type === OverwriteType.Member && overwrite.id !== client.user.id);
        await Promise.allSettled(memberOverwrites.map(overwrite => overwrite.delete('Remove applicant access from legacy application channel')));
        logger.warn('Legacy staff application channel could not be consolidated', { channelId: channel.id, error: error.message });
      }
    }
  } catch (error) {
    logger.error('Staff application privacy reconciliation failed', { error: error.message });
  }
}

async function updateRemote(client, id, status) {
  await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'POST', headers: { authorization: `Bearer ${secret(client)}`, 'content-type': 'application/json' }, body: JSON.stringify({ status }), signal: AbortSignal.timeout(8000) });
}

export async function pollStaffApplications(client) {
  try {
    if (!client.db.isAvailable?.()) return;
    const response = await fetch(`${API_BASE}/pending`, { headers: { authorization: `Bearer ${secret(client)}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Staff application poll returned HTTP ${response.status}`);
    const { applications = [] } = await response.json();
    for (const application of applications) {
      if (await client.db.get(key(application.id))) { await updateRemote(client, application.id, 'awaiting_confirmation'); continue; }
      const user = await client.users.fetch(application.discordId).catch(() => null);
      if (!user) { await updateRemote(client, application.id, 'failed'); continue; }
      const record = { ...application, status: 'awaiting_confirmation' };
      await client.db.set(key(application.id), record);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staff_application:confirm:${application.id}`).setLabel('אישור ושליחה לצוות').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`staff_application:reject:${application.id}`).setLabel('ביטול הבקשה').setStyle(ButtonStyle.Danger)
      );
      await user.send({ embeds: [createEmbed({ title: '📝 אישור בקשת הצטרפות לצוות EditIL', description: `התקבלה בקשה מהאתר עם המזהה **${application.id}**.\n\nאשרו שזו הבקשה שלכם כדי לשלוח אותה באופן פרטי לצוות.`, color: 'primary' })], components: [row] }).catch(async error => {
        await client.db.delete(key(application.id));
        await updateRemote(client, application.id, 'failed');
        throw error;
      });
      await updateRemote(client, application.id, 'awaiting_confirmation');
      logger.info('Staff application awaiting Discord confirmation', { applicationId: application.id, userId: user.id });
    }
  } catch (error) { logger.warn('Staff application poll failed', { error: error.message }); }
}

export function startStaffApplicationPolling(client) {
  if (client.staffApplicationTimer) return;
  void consolidateLegacyApplicationChannels(client).finally(() => pollStaffApplications(client));
  client.staffApplicationTimer = setInterval(() => void pollStaffApplications(client), INTERVAL_MS);
  client.staffApplicationTimer.unref?.();
}

export async function confirmStaffApplication(interaction, client, id) {
  client.staffApplicationLocks ??= new Set();
  if (client.staffApplicationLocks.has(id)) return interaction.reply({ content: 'הבקשה כבר נמצאת בתהליך אישור.', ephemeral: true });
  client.staffApplicationLocks.add(id);
  try {
  const application = await client.db.get(key(id));
  if (!application || application.discordId !== interaction.user.id) return interaction.reply({ content: 'הבקשה אינה קיימת או אינה שייכת לך.', ephemeral: true });
  if (application.status === 'confirmed') return interaction.reply({ content: 'הבקשה כבר אושרה ונשלחה.', ephemeral: true });
  const guild = client.guilds.cache.get(STAFF_APPLICATION_GUILD_ID);
  const category = guild?.channels.cache.get(STAFF_APPLICATION_CATEGORY_ID);
  const member = await guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!guild || category?.type !== ChannelType.GuildCategory || !member) return interaction.reply({ content: 'לא ניתן ליצור את הבקשה. ודאו שאתם עדיין חברים בשרת EditIL.', ephemeral: true });
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: 'לבוט חסרה הרשאה ליצור ערוץ פרטי. הצוות עודכן בתקלה.', ephemeral: true });
  const channel = await ensureStaffApplicationChannel(client);
  try { await channel.send({ embeds: [createEmbed({ title: `📝 בקשת צוות ${id}`, fields: [
    { name: 'מועמד/ת', value: `${member} (\`${member.id}\`)` }, { name: 'גיל', value: application.age },
    { name: 'ניסיון', value: application.experience }, { name: 'למה להצטרף לצוות?', value: application.motivation },
    { name: 'זמינות', value: application.availability }, ...(application.portfolio ? [{ name: 'תיק עבודות / קישור', value: application.portfolio }] : [])
  ], color: 'primary', footer: { text: 'EditIL • בקשת צוות מהאתר' } })], allowedMentions: { parse: [] } }); }
  catch (error) { throw error; }
  application.status = 'confirmed'; application.channelId = channel.id; application.confirmedAt = Date.now();
  await client.db.set(key(id), { id, discordId: application.discordId, status: application.status, channelId: channel.id, confirmedAt: application.confirmedAt });
  await updateRemote(client, id, 'confirmed');
  logger.info('Staff application delivered privately', { applicationId: id, userId: member.id, channelId: channel.id });
  return interaction.update({ content: 'הבקשה אושרה ונשלחה באופן פרטי לצוות EditIL.', embeds: [], components: [] });
  } finally { client.staffApplicationLocks.delete(id); }
}

export async function rejectStaffApplication(interaction, client, id) {
  const application = await client.db.get(key(id));
  if (!application || application.discordId !== interaction.user.id) return interaction.reply({ content: 'הבקשה אינה קיימת או אינה שייכת לך.', ephemeral: true });
  await client.db.set(key(id), { id, discordId: application.discordId, status: 'rejected', rejectedAt: Date.now() }); await updateRemote(client, id, 'rejected');
  return interaction.update({ content: 'בקשת ההצטרפות בוטלה ולא נשלחה לצוות.', embeds: [], components: [] });
}
