import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        try {
                const target = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");
                const reason = interaction.options.getString("reason");
                const moderator = interaction.user;
                const guildId = interaction.guildId;

                if (!target) {
                    throw new TitanBotError(
                        'Missing target user',
                        ErrorTypes.USER_INPUT,
                        'You must specify a user to warn.',
                        { subtype: 'invalid_user' },
                    );
                }

                if (!reason) {
                    throw new TitanBotError(
                        'Missing warning reason',
                        ErrorTypes.VALIDATION,
                        'You must provide a reason for the warning.',
                        { subtype: 'missing_required' },
                    );
                }

                if (!member) {
                    throw new TitanBotError(
                        "Target not found",
                        ErrorTypes.USER_INPUT,
                        "The target user is not currently in this server."
                    );
                }

                const hierarchyCheck = ModerationService.validateHierarchy(interaction.member, member, 'warn');
                if (!hierarchyCheck.valid) {
                    throw new TitanBotError(
                        hierarchyCheck.error,
                        ErrorTypes.PERMISSION,
                        hierarchyCheck.error
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

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            `⚠️ **Warned** ${target.tag}`,
                            `**Reason:** ${reason}\n**Total Warns:** ${totalWarns}`,
                        ),
                    ],
                });
        } catch (error) {
            logger.error('Warn command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'warn_failed' });
        }
    }
};