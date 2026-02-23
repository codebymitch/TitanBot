import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("masskick")
        .setDescription("Kick multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to kick (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass kick")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You do not have permission to kick members."
                    ),
                ],
            });
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Mass kick - No reason provided";

        try {
            
            const rateLimitKey = `masskick_${interaction.user.id}`;
            const isAllowed = await checkRateLimit(rateLimitKey, 3, 60000);
            if (!isAllowed) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        warningEmbed(
                            "You're performing mass kicks too fast. Please wait a minute before trying again.",
                            "⏳ Rate Limited"
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const userIds = usersInput
.replace(/<@!?(\d+)>/g, '$1')
.split(/[\s,]+/)
.filter(id => id && /^\d+$/.test(id))
.slice(0, 20);

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

            if (userIds.includes(interaction.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Cannot Kick Self",
                            "You cannot include yourself in a mass kick."
                        ),
                    ],
                });
            }

            if (userIds.includes(client.user.id)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Cannot Kick Bot",
                            "You cannot include the bot in a mass kick."
                        ),
                    ],
                });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    
                    if (!member) {
                        results.failed.push({ userId, reason: "User not in server" });
                        continue;
                    }

                    if (member.roles.highest.position >= interaction.member.roles.highest.position && 
                        interaction.guild.ownerId !== interaction.user.id) {
                        results.skipped.push({ 
                            user: member.user.tag, 
                            userId, 
                            reason: "Cannot kick user with equal or higher role" 
                        });
                        continue;
                    }

                    await member.kick(reason);

                    results.successful.push({
                        user: member.user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Kicked",
                            target: `${member.user.tag} (${member.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Kick)`,
                            metadata: {
                                userId: member.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to kick user ${userId}:`, error);
                    results.failed.push({ 
                        userId, 
                        reason: error.message || "Unknown error" 
                    });
                }
            }

            let description = `**Mass Kick Results:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **Successfully Kicked (${results.successful.length}):**\n`;
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
                        `👢 Mass Kick Completed`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in masskick command:", error);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while processing the mass kick. Please try again later."
                    ),
                ],
            });
        }
    }
};



