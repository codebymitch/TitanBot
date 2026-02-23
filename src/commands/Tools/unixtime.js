import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Get the current Unix timestamp'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '⏱️ Current Unix Timestamp',
                    `**Seconds since Unix Epoch:** \`${unixTimestamp}\`\n` +
                    `**Milliseconds since Unix Epoch:** \`${now.getTime()}\`\n\n` +
                    `**Human-readable (UTC):** ${now.toUTCString()}\n` +
                    `**ISO String:** ${now.toISOString()}`
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            },
            'Failed to get unix timestamp. Please try again.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};



