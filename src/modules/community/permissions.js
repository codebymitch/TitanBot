import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getConfig } from './store.js';
import { createEmbed } from '../../utils/embeds.js';

export const AccessLevel = Object.freeze({ EVERYONE: 0, VERIFIED: 1, HELPER: 2, MODERATOR: 3, ADMIN: 4, OWNER: 5 });

export async function memberAccessLevel(interaction, client) {
  if (!interaction.inGuild() || !interaction.member) return AccessLevel.EVERYONE;
  const ownerIds = new Set((process.env.OWNER_IDS || '').split(',').map(v => v.trim()).filter(Boolean));
  if (interaction.guild?.ownerId === interaction.user.id || ownerIds.has(interaction.user.id)) return AccessLevel.OWNER;
  const p = interaction.member.permissions;
  if (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild)) return AccessLevel.ADMIN;
  if (p.has(PermissionFlagsBits.ModerateMembers) && p.has(PermissionFlagsBits.KickMembers) && p.has(PermissionFlagsBits.ManageMessages)) return AccessLevel.MODERATOR;
  if (p.has(PermissionFlagsBits.ManageMessages)) return AccessLevel.HELPER;
  const config = await getConfig(client, interaction.guildId);
  if (config.verification.roleId && interaction.member.roles?.cache?.has(config.verification.roleId)) return AccessLevel.VERIFIED;
  return AccessLevel.EVERYONE;
}

export async function requireAccess(interaction, client, defaultLevel, commandKey = interaction.commandName) {
  if (!interaction.inGuild()) {
    await interaction.reply({ embeds: [createEmbed({ title: 'פקודה לא זמינה', description: 'ניתן להשתמש בפקודה זו רק בתוך שרת.', color: 'error' })], flags: MessageFlags.Ephemeral });
    return false;
  }
  const config = await getConfig(client, interaction.guildId);
  const required = Number(config.commandPermissions?.[commandKey] ?? defaultLevel);
  if (await memberAccessLevel(interaction, client) >= required) return true;
  await interaction.reply({ embeds: [createEmbed({ title: 'אין הרשאה', description: 'אין לך הרשאה להשתמש בפקודה זו.', color: 'error' })], flags: MessageFlags.Ephemeral });
  return false;
}
