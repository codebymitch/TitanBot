import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Den Timeout eines Nutzers aufheben")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Nutzer, dessen Timeout aufgehoben werden soll")
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
            throw new NexoBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Du musst einen Nutzer angeben, dessen Timeout aufgehoben werden soll.',
                { subtype: 'invalid_user' },
            );
        }

        if (!member) {
            throw new NexoBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "Der Nutzer ist gerade nicht auf diesem Server.",
            );
        }

        await ModerationService.removeTimeoutUser({
            guild: interaction.guild!,
            member: member as GuildMember,
            moderator: interaction.member as GuildMember,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `🔓 **Timeout aufgehoben** für ${targetUser.tag}`,
                ),
            ],
        });
    },
} satisfies Command;
