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
        await interaction.deferReply({ ephemeral: true });

        // Permission Check
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ModerateMembers,
            )
        )
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Moderate Members` permission to remove a timeout.",
                    ),
                ],
            });

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");

        if (!member) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Target Not Found",
                        "The target user is not currently in this server.",
                    ),
                ],
            });
        }

        // Hierarchy Check
        if (!member.moderatable)
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Cannot Untimeout",
                        "I cannot modify this user. They might have a higher role than me or you.",
                    ),
                ],
            });

        // Check if the user is actually timed out
        if (!member.isCommunicationDisabled())
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "User Not Timed Out",
                        `${targetUser.tag} is not currently timed out.`,
                    ),
                ],
            });

        try {
            // Remove the timeout by setting the duration to null
            await member.timeout(null, "Timeout removed by moderator");

            // --- LOGGING THE ACTION ---
            const untimeoutEmbed = createEmbed(
                "🔓 Timeout Removed (Action Log)",
                `${targetUser.tag}'s timeout has been removed by ${interaction.user}.`,
            )
                .setColor("#2ECC71") // Green for Reverting Restriction
                .addFields(
                    {
                        name: "Target User",
                        value: `${targetUser.tag} (${targetUser.id})`,
                        inline: false,
                    },
                    {
                        name: "Moderator",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                );

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
            // ---------------------------

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `🔓 **Removed timeout** from ${targetUser.tag}`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Untimeout Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "An unexpected error occurred while trying to remove the timeout. Please check my role permissions.",
                    ),
                ],
            });
        }
    },
};
