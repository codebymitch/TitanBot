import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { snipeCache } from '../../utils/snipeCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Show the last deleted message in this channel'),

    async execute(interaction) {
        const cached = snipeCache.get(interaction.channelId);

        if (!cached) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Nothing to Snipe', 'No recently deleted messages found in this channel.')],
                ephemeral: true,
            });
        }

        const embed = createEmbed({
            title: '🔍 Sniped Message',
            description: cached.content || '*(no text content)*',
            color: 'warning',
            footer: { text: `Deleted • ${cached.author}` },
            timestamp: false,
        });

        embed.setTimestamp(cached.timestamp);

        if (cached.attachmentUrl) {
            embed.setImage(cached.attachmentUrl);
        }

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};
