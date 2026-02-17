import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logModerationAction } from '../utils/moderation.js';

/**
 * Moderation Service - Centralized moderation operations
 * Handles business logic for banning, kicking, timing out, and warning users
 */
export class ModerationService {
  /**
   * Validate that a moderator can perform action on a target
   * @param {import('discord.js').GuildMember} moderator - The moderator
   * @param {import('discord.js').GuildMember} target - The target user
   * @param {string} action - The action being performed
   * @returns {Object} Validation result with success and message
   */
  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, error: 'Invalid moderator or target' };
    }

    // Owner bypass
    if (moderator.guild.ownerId === moderator.id) {
      return { valid: true };
    }

    // Role hierarchy check
    if (moderator.roles.highest.position <= target.roles.highest.position) {
      return {
        valid: false,
        error: `You cannot ${action} a user with an equal or higher role than you.`
      };
    }

    return { valid: true };
  }

  /**
   * Validate that bot can perform action on a target
   * @param {import('discord.js').Client} client - The Discord client
   * @param {import('discord.js').GuildMember} target - The target user
   * @param {string} action - The action being performed
   * @returns {Object} Validation result
   */
  static validateBotHierarchy(client, target, action) {
    if (!client || !target) {
      return { valid: false, error: 'Invalid client or target' };
    }

    const botMember = target.guild.members.me;
    if (!botMember) {
      return { valid: false, error: 'Bot is not in the guild' };
    }

    // Check role position
    if (botMember.roles.highest.position <= target.roles.highest.position) {
      return {
        valid: false,
        error: `I cannot ${action} a user with an equal or higher role than me.`
      };
    }

    return { valid: true };
  }

  /**
   * Ban a user from the guild
   * @param {Object} params - Ban parameters
   * @returns {Promise<Object>} Ban result
   */
  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      // Fetch or find target member
      let targetMember = null;
      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      // Validate hierarchy
      if (targetMember) {
        const botCheck = this.validateBotHierarchy(guild.client, targetMember, 'ban');
        if (!botCheck.valid) {
          throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
        }

        const modCheck = this.validateHierarchy(moderator, targetMember, 'ban');
        if (!modCheck.valid) {
          throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
        }
      }

      // Execute ban
      await guild.members.ban(user.id, { reason });

      // Log action
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Banned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            deleteDays
          }
        }
      });

      logger.info(`User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        success: true,
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  /**
   * Kick a user from the guild
   * @param {Object} params - Kick parameters
   * @returns {Promise<Object>} Kick result
   */
  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      // Validate hierarchy
      const botCheck = this.validateBotHierarchy(guild.client, member, 'kick');
      if (!botCheck.valid) {
        throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
      }

      const modCheck = this.validateHierarchy(moderator, member, 'kick');
      if (!modCheck.valid) {
        throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
      }

      // Check if kickable
      if (!member.kickable) {
        throw new TitanBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          'I do not have permission to kick this member'
        );
      }

      // Execute kick
      await member.kick(reason);

      // Log action
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Kicked',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User kicked: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        success: true,
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error kicking user:', error);
      throw error;
    }
  }

  /**
   * Timeout a user
   * @param {Object} params - Timeout parameters
   * @returns {Promise<Object>} Timeout result
   */
  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, moderator, and duration are required'
        );
      }

      // Validate hierarchy
      const botCheck = this.validateBotHierarchy(guild.client, member, 'timeout');
      if (!botCheck.valid) {
        throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
      }

      const modCheck = this.validateHierarchy(moderator, member, 'timeout');
      if (!modCheck.valid) {
        throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
      }

      // Check if moderatable
      if (!member.moderatable) {
        throw new TitanBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          'I cannot timeout this member'
        );
      }

      // Execute timeout
      await member.timeout(durationMs, reason);

      // Log action
      const durationMinutes = Math.floor(durationMs / 60000);
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Timed Out',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} minutes`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(`User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        success: true,
        caseId,
        user: member.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (error) {
      logger.error('Error timing out user:', error);
      throw error;
    }
  }

  /**
   * Remove timeout from a user
   * @param {Object} params - Untimeout parameters
   * @returns {Promise<Object>} Untimeout result
   */
  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout removed by moderator'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      // Check if moderatable
      if (!member.moderatable) {
        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          'I cannot modify this member'
        );
      }

      // Check if currently timed out
      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} is not currently timed out`
        );
      }

      // Execute removal
      await member.timeout(null, reason);

      // Log action
      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Untimeouted',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Timeout removed: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        success: true,
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Error removing timeout:', error);
      throw error;
    }
  }

  /**
   * Unban a user from the guild
   * @param {Object} params - Unban parameters
   * @returns {Promise<Object>} Unban result
   */
  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      // Check if user is banned
      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} is not currently banned from this server`
        );
      }

      // Execute unban
      await guild.members.unban(user.id, reason);

      // Log action
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Unbanned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        success: true,
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error unbanning user:', error);
      throw error;
    }
  }
}
