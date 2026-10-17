import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import type { Command } from '../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verifiziere dich und erhalte Zugang zum Server'),

    async execute(interaction, config, client) {
        const guild = interaction.guild!;

        const result = await verifyUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [infoEmbed('Bereits verifiziert', 'Du bist bereits verifiziert.')],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed(
                'Verifizierung abgeschlossen',
                `Du wurdest verifiziert und hast die Rolle **${result.roleName}** erhalten! Willkommen auf dem Server! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
} satisfies Command;
