/**
 * Permission Guard - Centralized permission checking for commands
 * Ensures consistent security checks across all command handlers
 */

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from './logger.js';
import { errorEmbed } from './embeds.js';

/**
 * Check if a user has admin permissions in the guild
 * @param {import('discord.js').GuildMember} member - The guild member to check
 * @returns {boolean} True if user is admin
 */
export function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if a user has mod permissions (Admin or ManageGuild)
 * @param {import('discord.js').GuildMember} member - The guild member to check
 * @returns {boolean} True if user has mod permissions
 */
export function isModerator(member) {
  if (!member) return false;
  return member.permissions.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild
  ]);
}

/**
 * Check if a user has specific permission(s)
 * @param {import('discord.js').GuildMember} member - The guild member to check
 * @param {string|string[]} permissions - Permission(s) to check
 * @returns {boolean} True if user has all specified permissions
 */
export function hasPermission(member, permissions) {
  if (!member) return false;
  return member.permissions.has(permissions);
}

/**
 * Check if bot has required permissions in a channel
 * @param {import('discord.js').GuildChannel} channel - The channel to check
 * @param {string|string[]} permissions - Required permission(s)
 * @returns {boolean} True if bot has all required permissions
 */
export function botHasPermission(channel, permissions) {
  if (!channel || !channel.guild) return false;
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  return channel.permissionsFor(botMember).has(permissions);
}

/**
 * Guard helper - Check user permissions and respond with error embed if missing
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction
 * @param {string|string[]} requiredPermissions - Permission(s) required
 * @param {string} [errorMessage] - Custom error message
 * @returns {Promise<boolean>} True if user has permissions, false otherwise (response already sent)
 */
export async function checkUserPermissions(
  interaction,
  requiredPermissions,
  errorMessage = 'You do not have permission to use this command.'
) {
  const member = interaction.member;
  
  if (!member.permissions.has(requiredPermissions)) {
    await interaction.reply({
      embeds: [errorEmbed('Permission Denied', errorMessage)],
      flags: MessageFlags.Ephemeral
    });
    
    logger.warn(
      `[PERMISSION_DENIED] User ${member.id} attempted command ${interaction.commandName} in guild ${interaction.guildId}`
    );
    return false;
  }
  
  return true;
}

/**
 * Guard helper - Check bot permissions in channel and respond with error if missing
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - The interaction
 * @param {string|string[]} requiredPermissions - Permission(s) required
 * @param {import('discord.js').TextChannel} [channel] - Channel to check (defaults to command channel)
 * @returns {Promise<boolean>} True if bot has permissions, false otherwise (response already sent)
 */
export async function checkBotPermissions(
  interaction,
  requiredPermissions,
  channel = null
) {
  const targetChannel = channel || interaction.channel;
  
  if (!targetChannel || !targetChannel.guild) {
    await interaction.reply({
      embeds: [errorEmbed('Error', 'Could not determine channel.')],
      flags: MessageFlags.Ephemeral
    });
    return false;
  }
  
  const botMember = targetChannel.guild.members.me;
  if (!botMember) {
    await interaction.reply({
      embeds: [errorEmbed('Error', 'Could not find bot member in this guild.')],
      flags: MessageFlags.Ephemeral
    });
    return false;
  }
  
  const permissions = targetChannel.permissionsFor(botMember);
  const missingPerms = [];
  
  const permArray = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  for (const perm of permArray) {
    if (!permissions.has(perm)) {
      missingPerms.push(perm);
    }
  }
  
  if (missingPerms.length > 0) {
    await interaction.reply({
      embeds: [errorEmbed(
        'Missing Permissions',
        `I need the following permissions in ${targetChannel}: ${missingPerms.join(', ')}`
      )],
      flags: MessageFlags.Ephemeral
    });
    
    logger.warn(
      `[BOT_PERMISSION_DENIED] Bot missing permissions [${missingPerms.join(', ')}] in channel ${targetChannel.id}`
    );
    return false;
  }
  
  return true;
}

/**
 * Audit log permission check result
 * @param {string} userId - User ID
 * @param {string} action - Action being performed
 * @param {boolean} allowed - Whether the action was allowed
 * @param {string} [reason] - Reason for deny
 */
export function auditPermissionCheck(userId, action, allowed, reason = null) {
  if (allowed) {
    logger.debug(`[PERMISSION_AUDIT] User ${userId} authorized for action: ${action}`);
  } else {
    logger.warn(`[PERMISSION_AUDIT] User ${userId} denied for action: ${action} - ${reason || 'insufficient permissions'}`);
  }
}

export default {
  isAdmin,
  isModerator,
  hasPermission,
  botHasPermission,
  checkUserPermissions,
  checkBotPermissions,
  auditPermissionCheck
};

