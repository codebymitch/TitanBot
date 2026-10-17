import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Zeigt den aktuellen Unix-Zeitstempel'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '⏱️ Aktueller Unix-Zeitstempel',
                    `**Sekunden seit Unix-Epoche:** \`${unixTimestamp}\`\n` +
                    `**Millisekunden seit Unix-Epoche:** \`${now.getTime()}\`\n\n` +
                    `**Lesbar (UTC):** ${now.toUTCString()}\n` +
                    `**ISO-String:** ${now.toISOString()}`
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            },
            'Der Unix-Zeitstempel konnte nicht abgerufen werden. Versuch es noch mal.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
} satisfies Command;