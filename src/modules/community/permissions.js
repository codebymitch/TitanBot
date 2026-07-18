import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getConfig } from './store.js';
import { createEmbed } from '../../utils/embeds.js';
import { BOT_OWNER_USER_ID } from '../../config/owner.js';

export const AccessLevel = Object.freeze({ EVERYONE: 0, VERIFIED: 1, HELPER: 2, MODERATOR: 3, ADMIN: 4, OWNER: 5 });

export async function memberAccessLevel(interaction, client) {
  if (!interaction.inGuild() || !interaction.member) return AccessLevel.EVERYONE;
  if (interaction.user.id === BOT_OWNER_USER_ID) return AccessLevel.OWNER;
  const p = interaction.member.permissions;
  const config = await getConfig(client, interaction.guildId);
  const hasRole = id => Boolean(id && interaction.member.roles?.cache?.has(id));
  if (hasRole(config.staffRoles?.administrator)) return AccessLevel.ADMIN;
  if (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild)) return AccessLevel.ADMIN;
  if (hasRole(config.staffRoles?.moderator)) return AccessLevel.MODERATOR;
  if (p.has(PermissionFlagsBits.ModerateMembers) && p.has(PermissionFlagsBits.KickMembers) && p.has(PermissionFlagsBits.ManageMessages)) return AccessLevel.MODERATOR;
  if (hasRole(config.staffRoles?.helper)) return AccessLevel.HELPER;
  if (p.has(PermissionFlagsBits.ManageMessages)) return AccessLevel.HELPER;
  // Verification controls server/channel access, not member-facing commands.
  // Every guild member receives the public-command level; staff levels above
  // this still require their configured roles or Discord permissions.
  return AccessLevel.VERIFIED;
}

export async function requireAccess(interaction, client, defaultLevel, commandKey = interaction.commandName) {
  if (!interaction.inGuild()) {
    await interaction.reply({ embeds: [createEmbed({ title: 'פקודה לא זמינה', description: 'ניתן להשתמש בפקודה זו רק בתוך שרת.', color: 'error' })], flags: MessageFlags.Ephemeral });
    return false;
  }
  const config = await getConfig(client, interaction.guildId);
  const setting = config.commandSettings?.[commandKey] || config.commandSettings?.[interaction.commandName];
  if (setting?.enabled === false) {
    await interaction.reply({ embeds: [createEmbed({ title: 'הפקודה מושבתת', description: 'הפקודה הזו הושבתה בהגדרות השרת.', color: 'error' })], flags: MessageFlags.Ephemeral });
    return false;
  }
  const required = Number(config.commandPermissions?.[commandKey] ?? defaultLevel);
  if (await memberAccessLevel(interaction, client) >= required) return true;
  await interaction.reply({ embeds: [createEmbed({ title: 'אין הרשאה', description: 'אין לך הרשאה להשתמש בפקודה זו.', color: 'error' })], flags: MessageFlags.Ephemeral });
  return false;
}
