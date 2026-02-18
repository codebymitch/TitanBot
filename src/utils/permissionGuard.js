




import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from './logger.js';
import { errorEmbed } from './embeds.js';






export function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}






export function isModerator(member) {
  if (!member) return false;
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
  checkUserPermissions,
  checkBotPermissions,
  auditPermissionCheck
};


