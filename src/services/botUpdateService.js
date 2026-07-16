import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { DEFAULT_UPDATE_CHANNEL_ID, DEFAULT_UPDATE_CONTENT } from '../config/botUpdates.js';
import { logger } from '../utils/logger.js';

const key = guildId => `guild:${guildId}:bot_updates`;
export const defaultUpdateSettings = () => ({
  guildId: null, channelId: DEFAULT_UPDATE_CHANNEL_ID, roleId: null,
  currentVersion: DEFAULT_UPDATE_CONTENT.version, lastAnnouncedVersion: null,
  automaticEnabled: true, lastMessageId: null, lastAnnouncementAt: null,
  lastAnnouncementAuthor: null, content: { ...DEFAULT_UPDATE_CONTENT }
});

export async function getUpdateSettings(client, guildId) {
  const saved = await client.db.get(key(guildId), {});
  return { ...defaultUpdateSettings(), ...(saved || {}), guildId,
    content: { ...DEFAULT_UPDATE_CONTENT, ...(saved?.content || {}) } };
}
export async function saveUpdateSettings(client, guildId, patch) {
  const current = await getUpdateSettings(client, guildId);
  const next = { ...current, ...patch, guildId,
    content: patch.content ? { ...current.content, ...patch.content } : current.content };
  await client.db.set(key(guildId), next);
  return next;
}
const bullets = values => (values?.length ? values.map(v => `• ${v}`).join('\n') : 'אין פריטים בעדכון זה.');
export function parseLines(value) { return value ? value.split(/\r?\n/).map(v => v.trim().replace(/^[•*-]\s*/, '')).filter(Boolean).slice(0, 20) : []; }
export function buildUpdateEmbed(client, content, { repeated = false } = {}) {
  const embed = new EmbedBuilder().setColor(0x5865F2)
    .setTitle(`${repeated ? '🔁 פרסום חוזר • ' : ''}${content.title || DEFAULT_UPDATE_CONTENT.title}`)
    .setDescription('גרסה חדשה של הבוט זמינה עכשיו!')
    .addFields(
      { name: '✨ מה חדש', value: bullets(content.newFeatures) },
      { name: '🛠️ תיקונים', value: bullets(content.fixes) },
      { name: '🚀 שיפורים', value: bullets(content.improvements) })
    .setFooter({ text: `EditIL Assistant • גרסה ${content.version}` }).setTimestamp();
  const avatar = client.user?.displayAvatarURL?.(); if (avatar) embed.setThumbnail(avatar);
  if (content.imageUrl) embed.setImage(content.imageUrl);
  if (content.changelogUrl) embed.setURL(content.changelogUrl);
  return embed;
}
export async function resolveUpdateChannel(guild, settings) {
  const channel = guild.channels.cache.get(settings.channelId) || await guild.channels.fetch(settings.channelId).catch(() => null);
  if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('ערוץ עדכוני הבוט לא נמצא.');
  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('לבוט אין הרשאה לשלוח הודעות בערוץ עדכוני הבוט.');
  return channel;
}
export async function postUpdate(client, guild, content, { authorId = 'automatic', pingRole = true, repeated = false } = {}) {
  const settings = await getUpdateSettings(client, guild.id); const channel = await resolveUpdateChannel(guild, settings);
  const role = pingRole && settings.roleId ? guild.roles.cache.get(settings.roleId) : null;
  const message = await channel.send({ content: role ? `<@&${role.id}>` : undefined,
    embeds: [buildUpdateEmbed(client, content, { repeated })], allowedMentions: { parse: [], roles: role ? [role.id] : [] } });
  await saveUpdateSettings(client, guild.id, { currentVersion: content.version, lastAnnouncedVersion: content.version,
    lastMessageId: message.id, lastAnnouncementAt: new Date().toISOString(), lastAnnouncementAuthor: authorId, content });
  logger.info('Bot update posted', { guildId: guild.id, channelId: channel.id, messageId: message.id, version: content.version, authorId, repeated });
  return message;
}
export async function runStartupUpdateCheck(client) {
  if (client.botUpdateStartupChecked) return; client.botUpdateStartupChecked = true;
  // Never announce automatically when writes would only reach MemoryStorage.
  // Otherwise every process restart forgets the announced version and reposts it.
  if (typeof client.db?.isAvailable === 'function' && !client.db.isAvailable()) {
    logger.warn('Skipping automatic bot updates because persistent database storage is unavailable');
    return;
  }
  for (const guild of client.guilds.cache.values()) {
    try {
      let s = await getUpdateSettings(client, guild.id);
      if (isNewerVersion(DEFAULT_UPDATE_CONTENT.version, s.currentVersion)) {
        s = await saveUpdateSettings(client, guild.id, { currentVersion: DEFAULT_UPDATE_CONTENT.version, content: { ...DEFAULT_UPDATE_CONTENT } });
      }
      if (s.automaticEnabled && s.currentVersion !== s.lastAnnouncedVersion) await postUpdate(client, guild, { ...s.content, version: s.currentVersion });
    }
    catch (error) { logger.error('Failed update announcement', { guildId: guild.id, error: error.stack || error.message }); }
  }
}

export function isNewerVersion(candidate, current) {
  const parts = value => String(value || '').replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const next = parts(candidate); const saved = parts(current);
  for (let index = 0; index < Math.max(next.length, saved.length); index += 1) {
    if ((next[index] || 0) !== (saved[index] || 0)) return (next[index] || 0) > (saved[index] || 0);
  }
  return false;
}
