import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Zeigt die aktuelle Uhrzeit in verschiedenen Zeitzonen')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('Die anzuzeigende Zeitzone (z. B. UTC, Europe/Berlin)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('de-DE', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Ungültige Zeitzone. Bitte nutze eine gültige Zeitzonen-ID (z. B. UTC, Europe/Berlin, America/New_York)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Aktuelle Uhrzeit',
                    `**${timezone}:** ${timeString}\n` +
                    `**Unix-Zeitstempel:** \`${unixTimestamp}\`\n` +
                    `**ISO-String:** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Die aktuelle Uhrzeit konnte nicht abgerufen werden. Versuch es noch mal.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
} satisfies Command;