import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { SoftWarningService } from '../../services/moderation/softWarningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function getMemberHighestRole(member, guildId) {
    if (!member?.roles?.highest || member.roles.highest.id === guildId) {
        return 'لا يوجد';
    }
    return `${member.roles.highest}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('softwarn')
        .setDescription('Give a soft warning (3 soft warnings = 1 official warning)')
        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription('User to soft-warn')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the soft warning')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) {
            logger.warn('SoftWarn interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'softwarn'
            });
            return;
        }

        const target = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason');
        const moderator = interaction.user;
        const executorMember = interaction.member;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to soft-warn.',
                { subtype: 'invalid_user' }
            );
        }

        if (!reason) {
            throw new TitanBotError(
                'Missing soft-warning reason',
                ErrorTypes.VALIDATION,
                'You must provide a reason for the soft warning.',
                { subtype: 'missing_required' }
            );
        }

        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'The target user is not currently in this server.'
            );
        }

        ModerationService.assertModerationHierarchy(executorMember, member, 'warn');

        const {
            id: softWarnId,
            softCount,
            threshold,
            reachedThreshold
        } = SoftWarningService.addSoftWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now()
        });

        const targetHighestRole = getMemberHighestRole(member, guildId);
        const moderatorHighestRole = getMemberHighestRole(executorMember, guildId);

        let escalatedWarning = null;
        if (reachedThreshold) {
            escalatedWarning = await WarningService.addWarning({
                guildId,
                userId: target.id,
                moderatorId: moderator.id,
                reason: `Auto-warn after ${threshold} soft warnings (Last reason: ${reason})`,
                timestamp: Date.now()
            });
        }

        let dmSent = false;
        try {
            const dmDescription = [
                `**السبب:** ${reason}`,
                `**عدد السوفت وورن:** ${softCount} / ${threshold}`,
                `**الشخص الذي أعطاك السوفت وورن:** ${moderator.tag} (${moderator})`,
                `**أعلى رول معك:** ${targetHighestRole}`,
                `**أعلى رول مع من أعطاك السوفت وورن:** ${moderatorHighestRole}`,
                ...(reachedThreshold && escalatedWarning
                    ? [
                        `🚨 **تنبيه:** وصلت إلى **${threshold}** سوفت وورن، وتم تحويلها تلقائياً إلى **تحذير رسمي (Warn)**!`,
                        `**إجمالي التحذيرات الرسمية:** ${escalatedWarning.totalCount}`
                    ]
                    : [])
            ].join('\n');

            await target.send({
                embeds: [
                    warningEmbed(
                        reachedThreshold
                            ? `🚨 تم تحويل السوفت وورن إلى Warn رسمي في **${interaction.guild.name}**`
                            : `🔔 لقد تلقيت سوفت وورن في **${interaction.guild.name}**`,
                        dmDescription
                    )
                ]
            });
            dmSent = true;
        } catch (dmError) {
            logger.warn('Could not send DM to soft-warned user', {
                userId: target.id,
                guildId,
                error: dmError?.message
            });
        }

        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: reachedThreshold ? 'Soft Warning Escalated to Warn' : 'User Soft-Warned',
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    softWarnId,
                    softCount,
                    threshold,
                    reachedThreshold,
                    escalatedWarningId: escalatedWarning?.id || null,
                    totalOfficialWarns: escalatedWarning?.totalCount ?? null,
                    targetHighestRole,
                    moderatorHighestRole,
                    dmSent
                }
            }
        });

        const replyDescription = [
            `**الشخص الذي أخذ السوفت وورن:** ${target.tag} (${target})`,
            `**الشخص الذي أعطى السوفت وورن:** ${moderator.tag} (${moderator})`,
            `**السبب:** ${reason}`,
            `**عدد السوفت وورن:** ${softCount} / ${threshold}`,
            `**أعلى رول مع اللي أخذ السوفت:** ${targetHighestRole}`,
            `**أعلى رول مع اللي أداه له:** ${moderatorHighestRole}`,
            `**رسالة الخاص (DM):** ${dmSent ? 'تم الإرسال ✅' : 'تعذر الإرسال ⚠️'}`,
            ...(reachedThreshold && escalatedWarning
                ? [`⚡ **تم التحويل التلقائي إلى Warn رسمي** (إجمالي التحذيرات: ${escalatedWarning.totalCount})`]
                : [])
        ].join('\n');

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    reachedThreshold
                        ? `⚡ تم تحويل 3 سوفت وورن إلى Warn رسمي لـ ${target.tag}`
                        : `🔔 تم إعطاء سوفت وورن لـ ${target.tag}`,
                    replyDescription
                )
            ]
        });
    }
};
