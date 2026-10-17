// permissionGuard.js

import { PermissionFlagsBits } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  GuildBasedChannel,
  GuildMember,
  PermissionResolvable,
} from 'discord.js';
import type { Command, GuildConfig } from '../types/index.js';
import { logger } from './logger.js';
import { replyUserError, ErrorTypes } from './errorHandler.js';
import { isBotOwner, getBotMessage } from '../config/bot.js';

/** The part of a command's JSON body read here. */
interface PermissionCommandJson {
  default_member_permissions?: string | null;
}

/** A SlashCommandBuilder (anything with toJSON) or its plain JSON. */
interface PermissionCommandData extends PermissionCommandJson {
  toJSON?(): PermissionCommandJson;
}

type RoleRef = string | { id?: string | null } | null | undefined;

/** Guild config fields read here (GuildConfig satisfies this). */
type ModeratorRoleConfig = { modRole?: RoleRef } | null | undefined;

type PermissionMember = GuildMember | null | undefined;

/**
 * Read default_member_permissions from a SlashCommandBuilder (or its JSON).
 * @param {import('discord.js').SlashCommandBuilder | object} commandData
 * @returns {bigint | null}
 */
export function getCommandDefaultPermissions(commandData: PermissionCommandData | null | undefined): bigint | null {
  const json = commandData?.toJSON?.() ?? commandData;
  const value = json?.default_member_permissions;

  if (value == null || value === '0') {
    return null;
  }

  return BigInt(value);
}

function normalizeRoleId(role: RoleRef): string | null {
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

function isModerationCategory(category: string | null | undefined): boolean {
  return category?.toLowerCase?.() === 'moderation';
}

/**
 * Whether a member holds the guild-configured moderator role (config wizard modRole).
 * @param {import('discord.js').GuildMember | null | undefined} member
 * @param {object | null | undefined} guildConfig
 * @returns {boolean}
 */
export function memberHasConfiguredModeratorRole(member: PermissionMember, guildConfig: ModeratorRoleConfig): boolean {
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
export function memberHasModerationCommandAccess(
  member: PermissionMember,
  guildConfig: ModeratorRoleConfig,
  requiredPermissions: PermissionResolvable | null = null
): boolean {
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
export function memberMeetsCommandPermissions(
  member: PermissionMember,
  permissionBitfield: bigint | null,
  options: { guildConfig?: ModeratorRoleConfig; commandCategory?: string | null } = {}
): boolean {
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
  interaction: ChatInputCommandInteraction,
  guildConfig: ModeratorRoleConfig,
  requiredPermissions: PermissionResolvable | null,
  errorMessage = 'Du hast keine Berechtigung, diesen Command zu nutzen.'
): Promise<boolean> {
  // Guild commands: member is a full GuildMember (as the JS assumed).
  if (memberHasModerationCommandAccess(interaction.member as GuildMember | null, guildConfig, requiredPermissions)) {
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
export async function enforceDefaultCommandPermissions(
  interaction: ChatInputCommandInteraction,
  command: Pick<Command, 'data' | 'category'> | null | undefined,
  context: { source?: string; guildConfig?: GuildConfig | null } = {}
): Promise<boolean> {
  if (isBotOwner(interaction.user?.id)) {
    return true;
  }

  const requiredPermissions = getCommandDefaultPermissions(command?.data);
  if (requiredPermissions == null) {
    return true;
  }

  // Prefix/guild invocations: member is a full GuildMember (as the JS assumed).
  const member = interaction.member as GuildMember | null;
  if (memberMeetsCommandPermissions(member, requiredPermissions, {
    guildConfig: context.guildConfig ?? null,
    commandCategory: command?.category ?? null,
  })) {
    return true;
  }

  const commandName = command?.data?.name ?? interaction.commandName ?? 'command';
  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: getBotMessage('noPermission'),
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

export function isAdmin(member: PermissionMember): boolean {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function isModerator(member: PermissionMember, guildConfig: ModeratorRoleConfig = null): boolean {
  if (!member) return false;
  if (memberHasConfiguredModeratorRole(member, guildConfig)) {
    return true;
  }
  return member.permissions.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild
  ]);
}

export function hasPermission(member: PermissionMember, permissions: PermissionResolvable): boolean {
  if (!member) return false;
  return member.permissions.has(permissions);
}

export function botHasPermission(channel: GuildBasedChannel | null | undefined, permissions: PermissionResolvable): boolean {
  if (!channel || !channel.guild) return false;
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  return channel.permissionsFor(botMember).has(permissions);
}

export async function checkUserPermissions(
  interaction: ChatInputCommandInteraction,
  requiredPermissions: PermissionResolvable,
  errorMessage = 'Du hast keine Berechtigung, diesen Command zu nutzen.'
): Promise<boolean> {
  // Guild commands: member is a full GuildMember (as the JS assumed).
  const member = interaction.member as GuildMember;

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
  interaction: ChatInputCommandInteraction,
  requiredPermissions: PermissionResolvable,
  channel: GuildBasedChannel | null = null
): Promise<boolean> {
  // DM channels have no guild; the `.guild` check below rejects them.
  const targetChannel = (channel || interaction.channel) as GuildBasedChannel | null;

  if (!targetChannel || !targetChannel.guild) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Der Kanal konnte nicht ermittelt werden.',
      context: { source: 'permissionGuard.checkBotPermissions' }
    });
    return false;
  }

  const botMember = targetChannel.guild.members.me;
  if (!botMember) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'Das Bot-Mitglied wurde auf diesem Server nicht gefunden.',
      context: { source: 'permissionGuard.checkBotPermissions' }
    });
    return false;
  }

  const permissions = targetChannel.permissionsFor(botMember);
  const missingPerms: PermissionResolvable[] = [];

  const permArray = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  for (const perm of permArray) {
    if (!permissions.has(perm)) {
      missingPerms.push(perm);
    }
  }

  if (missingPerms.length > 0) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: `Ich brauche folgende Berechtigungen in ${targetChannel}: ${missingPerms.join(', ')}`,
      context: { source: 'permissionGuard.checkBotPermissions', subtype: 'bot_permission' }
    });

    logger.warn(
      `[BOT_PERMISSION_DENIED] Bot missing permissions [${missingPerms.join(', ')}] in channel ${targetChannel.id}`
    );
    return false;
  }

  return true;
}

function hashUserId(userId: string): string {

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function auditPermissionCheck(userId: string, action: string, allowed: boolean, reason: string | null = null): void {

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
