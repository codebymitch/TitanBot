import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("The ID (or mention) of the user to unban")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban',
            });
            return;
        }

        const rawTarget = interaction.options.getString("target");
        const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Please provide a valid user ID or mention.',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Could not find a user with the ID \`${targetId}\`.`,
            });
        }

        const reason = interaction.options.getString("reason") || "No reason provided";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "✅ User Unbanned",
                    `Successfully unbanned **${targetUser.tag}** from the server.\n\n**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};
