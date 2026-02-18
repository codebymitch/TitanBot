import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server")
        .addUserOption(option =>
            option
                .setName("target")
                .setDescription("The user to unban (can be ID or mention)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
                const targetUser = interaction.options.getUser("target");
                const reason = interaction.options.getString("reason") || "No reason provided";

                
                const result = await ModerationService.unbanUser({
                    guild: interaction.guild,
                    user: targetUser,
                    moderator: interaction.member,
                    reason
                });

                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            "✅ User Unbanned",
                            `Successfully unbanned **${targetUser.tag}** from the server.\n\n**Reason:** ${reason}\n**Case ID:** #${result.caseId}`
                        )
                    ]
                });
        } catch (error) {
            logger.error('Unban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'unban_failed' });
        }
    }
};



