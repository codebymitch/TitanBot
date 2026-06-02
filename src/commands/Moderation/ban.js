import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to ban")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the ban"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ban'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                throw new Error("You do not have permission to ban members.");
            }

            const targetUser = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "No reason provided";

            if (!targetUser) {
                throw new Error("Could not find the target user.");
            }

            if (targetUser.id === interaction.user.id) {
                throw new Error("You cannot ban yourself.");
            }

            if (targetUser.id === client.user.id) {
                throw new Error("You cannot ban the bot.");
            }

            // Ban the user
            await interaction.guild.bans.create(targetUser.id, { reason });

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Banned",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: reason,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${targetUser.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`,
                    ),
                ],
            });

            logger.info('User banned', {
                guildId: interaction.guildId,
                userId: targetUser.id,
                moderatorId: interaction.user.id,
                reason: reason
            });

        } catch (error) {
            logger.error('Ban command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Ban Failed",
                        error.message || "An unexpected error occurred during the ban action. Please check my role permissions."
                    ),
                ],
            });
        }
    },
};

