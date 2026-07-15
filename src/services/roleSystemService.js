import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';
import { getConfig } from '../modules/community/store.js';
import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

export const PANEL_CATEGORIES = Object.freeze({ software: 'תוכנות עריכה', editing: 'סוגי עריכה', notifications: 'התראות', languages: 'שפות' });
export const panelKey = (guildId, id) => `community:${guildId}:rolepanel:${id}`;

export async function validateRoleAction(guild, actor, role, { selfAssignable = false, allowAdministrator = false } = {}) {
  const fail = async message => {
    if (!selfAssignable && guild.client) await logEvent({ client: guild.client, guildId: guild.id, eventType: EVENT_TYPES.ROLE_UPDATE, data: { title: 'פעולת תפקיד נכשלה', description: message, fields: [{ name: 'מבצע', value: actor ? `<@${actor.id}>` : 'לא ידוע' }, { name: 'תפקיד', value: role ? `${role} (\`${role.id}\`)` : 'לא קיים' }] } });
    return message;
  };
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return fail('לבוט חסרה הרשאת ניהול תפקידים.');
  if (!role || role.id === guild.id) return fail('לא ניתן לנהל את התפקיד @everyone.');
  if (role.managed || role.tags?.botId || role.tags?.integrationId || role.tags?.premiumSubscriberRole) return fail('לא ניתן לנהל תפקיד שמנוהל על ידי Discord או אינטגרציה.');
  if (role.position >= guild.members.me.roles.highest.position) return fail('תפקיד הבוט נמוך מדי בהיררכיית התפקידים.');
  if (!selfAssignable && actor?.id !== guild.ownerId && role.position >= actor.roles.highest.position) return fail('לא ניתן לנהל תפקיד שממוקם מעל התפקיד שלך.');
  if (role.permissions.has(PermissionFlagsBits.Administrator) && !(allowAdministrator && actor?.id === guild.ownerId)) return fail('לא ניתן לנהל תפקיד בעל הרשאת Administrator.');
  if (selfAssignable) {
    const config = await getConfig(guild.client, guild.id);
    const protectedIds = new Set(Object.values(config.staffRoles || {}).filter(Boolean));
    if (protectedIds.has(role.id) || role.permissions.has([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers])) return 'לא ניתן להוסיף את התפקיד הזה באמצעות בחירה עצמית.';
  }
  return null;
}

export function panelPayload(panel, guild) {
  const roles = panel.roleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
  const embed = createEmbed({ title: panel.title, description: panel.description || 'בחרו את התפקידים המתאימים לכם.', fields: [{ name: 'קטגוריה', value: PANEL_CATEGORIES[panel.category] || panel.category, inline: true }, { name: 'בחירה מרבית', value: String(panel.maxSelections), inline: true }], color: 'primary', footer: { text: `פאנל תפקידים #${panel.id}` } });
  if (panel.selectionType === 'buttons') {
    const buttons = roles.map(role => new ButtonBuilder().setCustomId(`role_panel_button:${panel.id}:${role.id}`).setLabel(role.name.slice(0, 80)).setStyle(ButtonStyle.Secondary));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons.slice(0, 5)), ...(buttons.length > 5 ? [new ActionRowBuilder().addComponents(buttons.slice(5))] : [])] };
  }
  const menu = new StringSelectMenuBuilder().setCustomId(`role_panel_select:${panel.id}`).setPlaceholder('בחרו תפקידים להוספה או להסרה').setMinValues(1).setMaxValues(Math.min(panel.maxSelections, roles.length)).addOptions(roles.map(role => ({ label: role.name.slice(0, 100), value: role.id })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

export async function getPanel(client, guildId, reference) {
  const id = String(reference || '').match(/(?:channels\/\d+\/\d+\/)?(\d+)$/)?.[1] || String(reference || '');
  let panel = await client.db.get(panelKey(guildId, id));
  if (panel) return panel;
  for (const key of await client.db.list(`community:${guildId}:rolepanel:`)) {
    const candidate = await client.db.get(key);
    if (candidate?.messageId === id) return candidate;
  }
  return null;
}

export const roleTemplates = Object.freeze({
  no_permissions: [], member: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.UseApplicationCommands],
  helper: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
  moderator: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers],
  supplier: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.UseExternalEmojis],
  bot_developer: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.UseApplicationCommands, PermissionFlagsBits.ViewAuditLog],
  notification: []
});

export async function validateSavedRolePanels(client) {
  const keys = await client.db.list('community:');
  for (const key of keys.filter(value => /^community:[^:]+:rolepanel:[^:]+$/.test(value))) {
    const panel = await client.db.get(key); const [, guildId] = key.split(':');
    const guild = client.guilds.cache.get(guildId); const channel = guild?.channels.cache.get(panel?.channelId);
    const message = channel?.isTextBased() ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
    if (!message) logger.warn('Saved role panel message is missing', { guildId, panelId: panel?.id, channelId: panel?.channelId });
    const invalidRoleIds = (panel?.roleIds || []).filter(id => !guild?.roles.cache.has(id));
    if (invalidRoleIds.length) logger.warn('Saved role panel contains missing roles', { guildId, panelId: panel.id, invalidRoleIds });
  }
}
