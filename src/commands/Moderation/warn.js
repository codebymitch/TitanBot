import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { PunishmentService } from '../../services/punishmentService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption(o =>
            o.setName("target").setRequired(true).setDescription("User to warn")
        )
        .addStringOption(o =>
            o.setName("reason").setRequired(false).setDescription("Reason for the warning")
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn('Warn defer failed', { userId: interaction.user.id });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "You need the `Moderate Members` permission to issue warnings."
                );
            }

            const target = interaction.options.getUser("target");

            // Missing args guard
            if (!target) {
                throw new TitanBotError(
                    "Missing target",
                    ErrorTypes.USER_INPUT,
                    "Please mention the user to warn.\nUsage: `nh!warn @user [reason]`"
                );
            }

            const member = interaction.options.getMember("target");
            // Default reason instead of null
            const reason = interaction.options.getString("reason") || "No reason provided";
            const moderator = interaction.user;
            const guildId = interaction.guildId;

            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "That user is not currently in this server."
                );
            }

            const result = await WarningService.addWarning({
                guildId,
                userId: target.id,
                moderatorId: moderator.id,
                reason,
                timestamp: Date.now()
            });

            if (!result.success) {
                throw new Error("Failed to store warning in database");
            }

            const totalWarns = result.totalCount;

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "User Warned",
                    target: `${target.tag} (${target.id})`,
                    executor: `${moderator.tag} (${moderator.id})`,
                    reason,
                    metadata: {
                        userId: target.id,
                        moderatorId: moderator.id,
                        totalWarns,
                        warningNumber: totalWarns,
                        warningId: result.id
                    }
                }
            });

            PunishmentService.record({
                guildId,
                userId: target.id,
                moderatorId: moderator.id,
                action: 'WARN',
                reason,
                caseId: result.id
            }).catch(e => logger.warn('Failed to record warn punishment:', e.message));

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⚠️ **Warned** ${target.tag}`,
                        `**Reason:** ${reason}\n**Total Warns:** ${totalWarns}`
                    )
                ]
            });

        } catch (error) {
            logger.error('Warn command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || "An unexpected error occurred.")]
            });
        }
    }
};
