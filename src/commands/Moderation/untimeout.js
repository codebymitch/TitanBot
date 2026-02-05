import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';
// Migrated from: commands/Moderation/untimeout.js
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
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers), // Requires Moderate Members permission
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            // Permission check
                if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                    throw new Error("You need the `Moderate Members` permission to remove a timeout.");
                }

                const targetUser = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");

                // Target validation
                if (!member) {
                    throw new Error("The target user is not currently in this server.");
                }

                // Hierarchy check
                if (!member.moderatable) {
                    throw new Error("I cannot modify this user. They might have a higher role than me or you.");
                }

                // Check if user is actually timed out
                if (!member.isCommunicationDisabled()) {
                    throw new Error(`${targetUser.tag} is not currently timed out.`);
                }

                // Remove the timeout
                await member.timeout(null, "Timeout removed by moderator");

                // Log the action
                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Member Untimeouted",
                        target: `${targetUser.tag} (${targetUser.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        metadata: {
                            userId: targetUser.id,
                            previousTimeout: member.communicationDisabledUntilTimestamp
                        }
                    }
                });

                // Send success response
                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            `🔓 **Removed timeout** from ${targetUser.tag}`,
                        ),
                    ],
                });
        } catch (error) {
            logger.error('Untimeout command error:', error);
            throw error;
        }
    }
};
