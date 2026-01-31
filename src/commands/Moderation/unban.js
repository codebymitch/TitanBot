import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

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
        await interaction.deferReply({ flags: ["Ephemeral"] });

        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You do not have permission to unban members."
                    ),
                ],
            });
        }

        const targetUser = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "No reason provided";

        try {
            // Check if user is actually banned
            const banList = await interaction.guild.bans.fetch();
            const banInfo = banList.get(targetUser.id);

            if (!banInfo) {
                return interaction.editReply({
                    embeds: [
                        infoEmbed(
                            "User Not Banned",
                            `${targetUser.tag} is not currently banned from this server.`
                        ),
                    ],
                });
            }

            // Unban the user
            await interaction.guild.members.unban(targetUser.id, reason);

            // Log the action
            await logModerationAction(
                client,
                interaction.guild,
                interaction.user,
                targetUser,
                "UNBAN",
                reason
            );

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "✅ User Unbanned",
                        `Successfully unbanned **${targetUser.tag}** from the server.\n\n` +
                        `**Reason:** ${reason}\n` +
                        `**Moderator:** ${interaction.user.tag}`
                    )
                ]
            });

        } catch (error) {
            logger.error(`Error in unban command for user ${targetUser.id}:`, error);
            
            // Handle specific errors
            if (error.code === 50013) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Permission Error",
                            "I do not have permission to unban members. Please check my role position and permissions."
                        ),
                    ],
                });
            }

            if (error.code === 10026) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Unknown User",
                            "This user ID is not valid or the user doesn't exist."
                        ),
                    ],
                });
            }

            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while trying to unban the user. Please try again later."
                    ),
                ],
            });
        }
    }
};
