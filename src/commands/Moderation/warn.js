import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
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
        try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                    throw new Error("You need the `Moderate Members` permission to issue warnings.");
                }

                const target = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");
                const reason = interaction.options.getString("reason");
                const moderator = interaction.user;
                const guildId = interaction.guildId;

                if (!member) {
                    throw new Error("The target user is not currently in this server.");
                }

                // Use WarningService for persistent storage
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

                await interaction.editReply({
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



