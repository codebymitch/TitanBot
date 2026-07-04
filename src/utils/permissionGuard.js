// permissionGuard.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { replyUserError, ErrorTypes } from './errorHandler.js';

/**
 * Read default_member_permissions from a SlashCommandBuilder (or its JSON).
 * @param {import('discord.js').SlashCommandBuilder | object} commandData
 * @returns {bigint | null}
 */
export function getCommandDefaultPermissions(commandData) {
  const json = commandData?.toJSON?.() ?? commandData;
  const value = json?.default_member_permissions;

  if (value == null || value === '0') {
    return null;
  }

  return BigInt(value);
}

function normalizeRoleId(role) {
  if (!role) {
    return null;
  }

  if (typeof role === 'string') {
    return role;
  }

  if (typeof role === 'object' && role.id) {
    return role.id;
  }

  return null;
}

function isModerationCategory(category) {
  return category?.toLowerCase?.() === 'moderation';
}

/**
 * Whether a member holds the guild-configured moderator role (config wizard modRole).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {object | null | undefined} guildConfig
 * @returns {boolean}
 */
export function memberHasConfiguredModeratorRole(member, guildConfig) {
  if (!member || !guildConfig) {
    return false;
  }

  const modRoleId = normalizeRoleId(guildConfig.modRole);

  return Boolean(modRoleId && member.roles.cache.has(modRoleId));
}

/**
 * Whether a member may run a moderation command (native Discord perm or configured modRole).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {object | null | undefined} guildConfig
 * @param {bigint | bigint[] | null} [requiredPermissions]
 * @returns {boolean}
 */
export function memberHasModerationCommandAccess(member, guildConfig, requiredPermissions = null) {
  if (!member) {
    return false;
  }

  if (member.guild?.ownerId === member.id) {
    return true;
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (requiredPermissions != null && member.permissions.has(requiredPermissions)) {
    return true;
  }

  return memberHasConfiguredModeratorRole(member, guildConfig);
}

/**
 * Whether a guild member satisfies a command's default_member_permissions bitfield.
 * Guild owners always pass. Moderation commands also accept the configured modRole.
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {bigint | null} permissionBitfield
 * @param {{ guildConfig?: object | null, commandCategory?: string | null }} [options]
 * @returns {boolean}
 */
export function memberMeetsCommandPermissions(member, permissionBitfield, options = {}) {
  if (permissionBitfield == null) {
    return true;
  }

  if (!member) {
    return false;
  }

  const { guildConfig = null, commandCategory = null } = options;

  if (isModerationCategory(commandCategory)) {
    return memberHasModerationCommandAccess(member, guildConfig, permissionBitfield);
  }

  if (member.guild?.ownerId === member.id) {
    return true;
  }

  return member.permissions.has(permissionBitfield);
}

/**
 * Check moderation command access and reply when denied.
 * @returns {Promise<boolean>}
 */
export async function checkModerationPermissions(
  interaction,
  guildConfig,
  requiredPermissions,
  errorMessage = 'You do not have permission to use this command.'
) {
  if (memberHasModerationCommandAccess(interaction.member, guildConfig, requiredPermissions)) {
    return true;
  }

  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: errorMessage,
    context: { source: 'permissionGuard.checkModerationPermissions' },
  });

  logger.warn('[PERMISSION_DENIED] Moderation command blocked', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: interaction.commandName,
  });

  return false;
}

/**
 * Enforce a command's default_member_permissions for prefix (and other non-Discord-gated) invocations.
 * Slash commands are gated by Discord, but prefix commands must mirror the same requirement in code.
 * @returns {Promise<boolean>} true when the member may proceed
 */
export async function enforceDefaultCommandPermissions(interaction, command, context = {}) {
  const requiredPermissions = getCommandDefaultPermissions(command?.data);
  if (requiredPermissions == null) {
    return true;
  }

  const member = interaction.member;
  if (memberMeetsCommandPermissions(member, requiredPermissions, {
    guildConfig: context.guildConfig ?? null,
    commandCategory: command?.category ?? null,
  })) {
    return true;
  }

  const commandName = command?.data?.name ?? interaction.commandName ?? 'command';
  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: 'You do not have permission to use this command.',
    context: {
      source: context.source ?? 'permissionGuard.enforceDefaultCommandPermissions',
      commandName,
      requiredPermissions: requiredPermissions.toString(),
    },
  });

  logger.warn('[PERMISSION_DENIED] Prefix command blocked by default_member_permissions', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: commandName,
    requiredPermissions: requiredPermissions.toString(),
  });

  return false;
}

export function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function isModerator(member, guildConfig = null) {
  if (!member) return false;
  if (memberHasConfiguredModeratorRole(member, guildConfig)) {
    return true;
  }
  return member.permissions.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild
  ]);
}

export function hasPermission(member, permissions) {
  if (!member) return false;
  return member.permissions.has(permissions);
}

export function botHasPermission(channel, permissions) {
  if (!channel || !channel.guild) return false;
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  return channel.permissionsFor(botMember).has(permissions);
}

export async function checkUserPermissions(
  interaction,
  requiredPermissions,
  errorMessage = 'You do not have permission to use this command.'
) {
  const member = interaction.member;

  if (!member.permissions.has(requiredPermissions)) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: errorMessage,
      context: { source: 'permissionGuard.checkUserPermissions' }
    });

    logger.warn(
      `[PERMISSION_DENIED] User ${member.id} attempted command ${interaction.commandName} in guild ${interaction.guildId}`
    );
    return false;
  }

  return true;
}

export async function checkBotPermissions(
  interaction,
  requiredPermissions,
  channel = null
) {
  const targetChannel = channel || interaction.channel;

  if (!targetChannel || !targetChannel.guild) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Could not determine channel.',
      context: { source: 'permissionGuard.checkBotPermissions' }
    });
    return false;
  }

  const botMember = targetChannel.guild.members.me;
  if (!botMember) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Could not find bot member in this guild.',
      context: { source: 'permissionGuard.checkBotPermissions' }
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
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: `I need the following permissions in ${targetChannel}: ${missingPerms.join(', ')}`,
      context: { source: 'permissionGuard.checkBotPermissions', subtype: 'bot_permission' }
    });

    logger.warn(
      `[BOT_PERMISSION_DENIED] Bot missing permissions [${missingPerms.join(', ')}] in channel ${targetChannel.id}`
    );
    return false;
  }

  return true;
}

function hashUserId(userId) {

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function auditPermissionCheck(userId, action, allowed, reason = null) {

  const userHash = hashUserId(userId);

  if (allowed) {
    logger.debug('[PERMISSION_AUDIT] Permission granted', { action, userHash });
  } else {
    const denyReason = reason || 'insufficient_permissions';
    logger.warn('[PERMISSION_AUDIT] Permission denied', { action, userHash, reason: denyReason });
  }
}

export default {
  isAdmin,
  isModerator,
  hasPermission,
  botHasPermission,
  getCommandDefaultPermissions,
  memberHasConfiguredModeratorRole,
  memberHasModerationCommandAccess,
  memberMeetsCommandPermissions,
  checkModerationPermissions,
  enforceDefaultCommandPermissions,
  checkUserPermissions,
  checkBotPermissions,
  auditPermissionCheck
};
