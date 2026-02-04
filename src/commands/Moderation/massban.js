import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Ban multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to ban (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass ban")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("Number of days of messages to delete (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
    await InteractionHelper.safeExecute(
        interaction,
        async () => {
        // safeExecute already defers

        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You do not have permission to ban members."
                    ),
                ],
            });
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Mass ban - No reason provided";
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        try {
            // Parse user IDs from input
            const userIds = usersInput
                .replace(/<@!?(\d+)>/g, '$1') // Replace mentions with just IDs
                .split(/[\s,]+/) // Split by spaces or commas
                .filter(id => id && /^\d+$/.test(id)) // Filter valid IDs
                .slice(0, 20); // Limit to 20 users at once

            if (userIds.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Invalid Users",
                            "Please provide valid user IDs or mentions. Maximum 20 users at once."
                        ),
                    ],
                });
            }

            // Prevent self-banning
            if (userIds.includes(interaction.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Cannot Ban Self",
                            "You cannot include yourself in a mass ban."
                        ),
                    ],
                });
            }

            // Prevent bot-banning
            if (userIds.includes(client.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Cannot Ban Bot",
                            "You cannot include the bot in a mass ban."
                        ),
                    ],
                });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            // Process each user
            for (const userId of userIds) {
                try {
                    // Try to fetch the user
                    const user = await client.users.fetch(userId).catch(() => null);
                    
                    if (!user) {
                        results.failed.push({ userId, reason: "User not found" });
                        continue;
                    }

                    // Try to get guild member
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    
                    if (member) {
                        // Check if user can be banned (hierarchy check)
                        if (member.roles.highest.position >= interaction.member.roles.highest.position && 
                            interaction.guild.ownerId !== interaction.user.id) {
                            results.skipped.push({ 
                                user: user.tag, 
                                userId, 
                                reason: "Cannot ban user with equal or higher role" 
                            });
                            continue;
                        }
                    }

                    // Ban the user
                    await interaction.guild.members.ban(userId, {
                        reason: reason,
                        deleteMessageDays: deleteDays
                    });

                    results.successful.push({
                        user: user.tag,
                        userId
                    });

                    // Log the action
                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Ban)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to ban user ${userId}:`, error);
                    results.failed.push({ 
                        userId, 
                        reason: error.message || "Unknown error" 
                    });
                }
            }

            // Create result embed
            let description = `**Mass Ban Results:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **Successfully Banned (${results.successful.length}):**\n`;
                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **Skipped (${results.skipped.length}):**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **Failed (${results.failed.length}):**\n`;
                results.failed.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0 ? successEmbed : warningEmbed;
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `🔨 Mass Ban Completed`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in massban command:", error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while processing the mass ban. Please try again later."
                    ),
                ],
            });
        }
    
        },
        { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
    );
}
};
