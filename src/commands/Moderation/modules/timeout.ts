import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';

const durationChoices = [
    { name: "5 Minuten", value: 5 },
    { name: "10 Minuten", value: 10 },
    { name: "30 Minuten", value: 30 },
    { name: "1 Stunde", value: 60 },
    { name: "6 Stunden", value: 360 },
    { name: "1 Tag", value: 1440 },
    { name: "1 Woche", value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Einem Nutzer für eine bestimmte Dauer einen Timeout geben.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Nutzer, der einen Timeout bekommen soll")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Dauer des Timeouts")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Grund für den Timeout"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const durationMinutes = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!targetUser) {
            throw new NexoBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Du musst einen Nutzer für den Timeout angeben.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new NexoBotError(
                "Cannot timeout self",
                ErrorTypes.VALIDATION,
                "Du kannst dir nicht selbst einen Timeout geben.",
            );
        }
        if (targetUser.id === client.user.id) {
            throw new NexoBotError(
                "Cannot timeout bot",
                ErrorTypes.VALIDATION,
                "Du kannst dem Bot keinen Timeout geben.",
            );
        }
        if (!member) {
            throw new NexoBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "Der Nutzer ist gerade nicht auf diesem Server.",
            );
        }

        const durationMs = durationMinutes! * 60 * 1000;
        const result = await ModerationService.timeoutUser({
            guild: interaction.guild!,
            member: member as GuildMember,
            moderator: interaction.member as GuildMember,
            durationMs,
            reason,
        });

        const durationDisplay =
            durationChoices.find((c) => c.value === durationMinutes)
                ?.name || `${durationMinutes} Minuten`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⏳ **Timeout** für ${targetUser.tag} (${durationDisplay}).`,
                    `**Grund:** ${reason}\n**Fall-ID:** #${result.caseId}`,
                ),
            ],
        });
    },
} satisfies Command;
