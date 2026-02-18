import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Remove timeout from a user")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to untimeout")
                .setRequired(true),
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
                const targetUser = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");

                
                const result = await ModerationService.removeTimeoutUser({
                    guild: interaction.guild,
                    member,
                    moderator: interaction.member
                });

                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            `🔓 **Removed timeout** from ${targetUser.tag}`,
                        ),
                    ],
                });
        } catch (error) {
            logger.error('Untimeout command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'untimeout_failed' });
        }
    }
};



