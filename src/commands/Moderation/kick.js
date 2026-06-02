import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to kick")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the kick"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Kick interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'kick'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "You do not have permission to kick members."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const reason = interaction.options.getString("reason") || "No reason provided";

            if (!targetUser) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "Could not find the target user."
                );
            }

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError(
                    "Cannot kick self",
                    ErrorTypes.VALIDATION,
                    "You cannot kick yourself."
                );
            }

            if (targetUser.id === client.user.id) {
                throw new TitanBotError(
                    "Cannot kick bot",
                    ErrorTypes.VALIDATION,
                    "You cannot kick the bot."
                );
            }

            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "The target user is not currently in this server."
                );
            }

            if (!member.kickable) {
                throw new TitanBotError(
                    "Cannot kick member",
                    ErrorTypes.PERMISSION,
                    "I cannot kick this user. They might have a higher role than me or you."
                );
            }

            await member.kick(reason);

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Kicked",
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
                        `👢 **Kicked** ${targetUser.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Kick command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Kick Failed",
                        error.userMessage || "An unexpected error occurred during the kick action. Please check my role permissions."
                    ),
                ],
            });
        }
    }
};

