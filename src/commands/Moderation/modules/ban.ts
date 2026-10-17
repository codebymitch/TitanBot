import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Einen Nutzer vom Server bannen")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Der Nutzer, der gebannt werden soll")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Grund für den Bann"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!user) {
            throw new NexoBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Du musst einen Nutzer zum Bannen angeben.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new NexoBotError(
                'Cannot ban self',
                ErrorTypes.VALIDATION,
                'Du kannst dich nicht selbst bannen.',
            );
        }
        if (user.id === client.user.id) {
            throw new NexoBotError(
                'Cannot ban bot',
                ErrorTypes.VALIDATION,
                'Du kannst den Bot nicht bannen.',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild!,
            user,
            moderator: interaction.member as GuildMember,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Gebannt:** ${user.tag}`,
                    `**Grund:** ${reason}\n**Fall-ID:** #${result.caseId}`,
                ),
            ],
        });
    },
} satisfies Command;
