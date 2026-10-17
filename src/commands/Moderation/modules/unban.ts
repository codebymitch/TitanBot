import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Einen Nutzer auf dem Server entbannen")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("Die ID (oder Erwähnung) des Nutzers, der entbannt werden soll")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Grund für die Entbannung")
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
        const targetId = rawTarget!.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bitte gib eine gültige Nutzer-ID oder Erwähnung an.',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Es wurde kein Nutzer mit der ID \`${targetId}\` gefunden.`,
            });
        }

        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild!,
            user: targetUser,
            moderator: interaction.member as GuildMember,
            reason,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "✅ Nutzer entbannt",
                    `**${targetUser.tag}** wurde erfolgreich entbannt.\n\n**Grund:** ${reason}\n**Fall-ID:** #${result.caseId}`,
                ),
            ],
        });
    },
} satisfies Command;
