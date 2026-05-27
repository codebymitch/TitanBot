import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { PunishmentService } from '../../services/punishmentService.js';
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
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "No reason provided";

            // Missing args guard
            if (!user) {
                return handleInteractionError(interaction,
                    Object.assign(new Error("Please mention the user to ban.\nUsage: `nh!ban @user [reason]`"), { userMessage: "Please mention the user to ban.\nUsage: `nh!ban @user [reason]`" }),
                    { subtype: 'missing_target' }
                );
            }

            if (user.id === interaction.user.id) {
                throw new Error("You cannot ban yourself.");
            }
            if (user.id === client.user.id) {
                throw new Error("You cannot ban the bot.");
            }

            
            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            PunishmentService.record({
                guildId: interaction.guildId,
                userId: user.id,
                moderatorId: interaction.user.id,
                action: 'BAN',
                reason,
                caseId: result.caseId
            }).catch(e => logger.warn('Failed to record ban punishment:', e.message));

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${user.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};



