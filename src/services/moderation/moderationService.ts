// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import type { Guild, GuildMember, Role, User } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

export type HierarchyCheck = { valid: true } | { valid: false; error: string };
export type HierarchyActor = 'moderator' | 'bot';

export interface ModerationActionResult {
  caseId: number;
  user: string;
  reason: string;
}

function getTargetLabel(target: GuildMember): string {
  return target.user?.tag ?? target.displayName ?? 'diesen Nutzer';
}

/** German verb for the internal action keys passed to the hierarchy checks. */
const ACTION_VERBS: Record<string, string> = {
  ban: 'bannen',
  kick: 'kicken',
  timeout: 'in den Timeout schicken',
  warn: 'verwarnen',
  untimeout: 'aus dem Timeout holen',
};

function actionVerb(action: string): string {
  return ACTION_VERBS[action] ?? action;
}

function getHighestRole(member: GuildMember | null | undefined): Role | null {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }: {
    actor: HierarchyActor;
    actorRole: Role;
    targetRole: Role;
    targetLabel: string;
    action: string;
  }): string {
    if (actor === 'moderator') {
      return (
        `Du kannst **${targetLabel}** nicht ${actionVerb(action)} – die Rolle **${targetRole.name}** ist gleich hoch oder höher als deine (**${actorRole.name}**). ` +
        `Zieh unter **Servereinstellungen → Rollen** deine Moderator-Rolle über **${targetRole.name}**.`
      );
    }

    return (
      `Ich kann **${targetLabel}** nicht ${actionVerb(action)} – meine Rolle **${actorRole.name}** ist gleich hoch oder niedriger als deren Rolle (**${targetRole.name}**). ` +
      `Zieh unter **Servereinstellungen → Rollen** meine Bot-Rolle über **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator: GuildMember, target: GuildMember, action: string, actor: HierarchyActor = 'moderator'): string {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);
      if (!botRole || !targetRole) {
        return `Bot-Rollenhierarchie: ${targetLabel} lässt sich nicht ${actionVerb(action)}`;
      }
      return `Bot-Rolle **${botRole.name}** ist zu niedrig für **${targetRole.name}** – schieb die Bot-Rolle höher`;
    }

    const modRole = getHighestRole(moderator);
    if (!modRole || !targetRole) {
      return `Rollenhierarchie: ${targetLabel} lässt sich nicht ${actionVerb(action)}`;
    }
    return `Deine Rolle **${modRole.name}** ist zu niedrig für **${targetRole.name}** – schieb deine Rolle höher`;
  }

  static validateHierarchy(moderator: GuildMember, target: GuildMember, action: string): HierarchyCheck {
    if (!moderator || !target) {
      return { valid: false, error: 'Ungültiger Moderator oder ungültiges Ziel' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Die Rollenhierarchie konnte nicht ermittelt werden. Erwähne den Nutzer oder nutze den Slash-Command.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target: GuildMember, action: string): HierarchyCheck {
    if (!target) {
      return { valid: false, error: 'Ungültiges Ziel' };
    }

    const botMember = target.guild?.members?.me;
    if (!botMember) {
      return { valid: false, error: 'Der Bot ist nicht auf dem Server' };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Die Rollenhierarchie des Bots konnte nicht ermittelt werden. Prüfe, ob meine Rolle auf diesem Server eingerichtet ist.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator: GuildMember, target: GuildMember, action: string): void {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) {
      throw new NexoBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
    }

    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) {
      throw new NexoBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'Kein Grund angegeben',
    deleteDays = 0
  }: {
    guild: Guild;
    user: User;
    moderator: GuildMember;
    reason?: string;
    deleteDays?: number;
  }): Promise<ModerationActionResult> {
    try {
      if (!guild || !user || !moderator) {
        throw new NexoBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Server, Nutzer und Moderator sind erforderlich.'
        );
      }

      let targetMember: GuildMember | null = null;
      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'ban');
      } else {

        const isOwner = guild.ownerId === moderator.id;
        const hasHighPerms = moderator.permissions.has([
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
            throw new NexoBotError(
                'You do not have sufficient permissions to ban users who are not in the server.',
                ErrorTypes.PERMISSION,
                'Du brauchst die Berechtigung „Server verwalten“ oder „Administrator“, um Nutzer zu bannen, die nicht auf dem Server sind.'
            );
        }
      }

      await guild.members.ban(user.id, { reason });

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
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'Kein Grund angegeben'
  }: {
    guild: Guild;
    member: GuildMember;
    moderator: GuildMember;
    reason?: string;
  }): Promise<ModerationActionResult> {
    try {
      if (!guild || !member || !moderator) {
        throw new NexoBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Server, Mitglied und Moderator sind erforderlich.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'kick');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);
        throw new NexoBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          `Ich kann **${targetLabel}** nicht kicken. Eventuell hat das Mitglied die Berechtigung **Administrator** oder eine verwaltete/Integrationsrolle. ` +
          'Stell sicher, dass meine Bot-Rolle unter **Servereinstellungen → Rollen** darüber liegt und das Mitglied kein Admin ist.'
        );
      }

      await member.kick(reason);

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
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error kicking user:', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'Kein Grund angegeben'
  }: {
    guild: Guild;
    member: GuildMember;
    moderator: GuildMember;
    durationMs: number;
    reason?: string;
  }): Promise<{ caseId: number; user: string; duration: number; reason: string }> {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new NexoBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Server, Mitglied, Moderator und Dauer sind erforderlich.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'timeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new NexoBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          `Ich kann **${targetLabel}** nicht in den Timeout schicken. Eventuell hat das Mitglied die Berechtigung **Administrator** oder eine verwaltete/Integrationsrolle. ` +
          'Stell sicher, dass meine Bot-Rolle unter **Servereinstellungen → Rollen** darüber liegt und das Mitglied kein Admin ist.'
        );
      }

      await member.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Timed Out',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} Minuten`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(`User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
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

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout durch Moderator aufgehoben'
  }: {
    guild: Guild;
    member: GuildMember;
    moderator: GuildMember;
    reason?: string;
  }): Promise<{ user: string }> {
    try {
      if (!guild || !member || !moderator) {
        throw new NexoBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Server, Mitglied und Moderator sind erforderlich.'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'untimeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new NexoBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `Ich kann **${targetLabel}** nicht bearbeiten. Eventuell hat das Mitglied die Berechtigung **Administrator** oder eine verwaltete/Integrationsrolle. ` +
          'Stell sicher, dass meine Bot-Rolle unter **Servereinstellungen → Rollen** darüber liegt.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new NexoBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} ist derzeit nicht im Timeout`
        );
      }

      await member.timeout(null, reason);

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
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Error removing timeout:', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'Kein Grund angegeben'
  }: {
    guild: Guild;
    user: User;
    moderator: GuildMember;
    reason?: string;
  }): Promise<ModerationActionResult> {
    try {
      if (!guild || !user || !moderator) {
        throw new NexoBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Server, Nutzer und Moderator sind erforderlich.'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new NexoBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} ist auf diesem Server derzeit nicht gebannt`
        );
      }

      await guild.members.unban(user.id, reason);

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
