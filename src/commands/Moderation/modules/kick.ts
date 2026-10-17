import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Einen Nutzer vom Server kicken")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Der Nutzer, der gekickt werden soll")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Grund für den Kick"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!targetUser) {
            throw new NexoBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Du musst einen Nutzer zum Kicken angeben.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new NexoBotError(
                "Cannot kick self",
                ErrorTypes.VALIDATION,
                "Du kannst dich nicht selbst kicken.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new NexoBotError(
                "Cannot kick bot",
                ErrorTypes.VALIDATION,
                "Du kannst den Bot nicht kicken.",
            );
        }

        if (!member) {
            throw new NexoBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "Der Nutzer ist gerade nicht auf diesem Server.",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild!,
            member: member as GuildMember,
            moderator: interaction.member as GuildMember,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **Gekickt:** ${targetUser.tag}`,
                    `**Grund:** ${reason}\n**Fall-ID:** #${result.caseId}`,
                ),
            ],
        });
    },
} satisfies Command;
