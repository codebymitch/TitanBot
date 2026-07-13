import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Untimeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'untimeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to untimeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server.",
            );
        }

        await ModerationService.removeTimeoutUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `🔓 **Removed timeout** from ${targetUser.tag}`,
                ),
            ],
        });
    },
};
