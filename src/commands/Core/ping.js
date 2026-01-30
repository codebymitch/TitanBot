import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks the bot's latency and API speed"),

    async execute(interaction) {
        const sent = await interaction.reply({
            content: "Pinging...",
            fetchReply: true,
        });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        // FIX: Passing null/undefined instead of an empty string ("") for the description
        // The createEmbed function handles the description being optional or null/undefined.
        const embed = createEmbed({ title: "🏓 Pong!", description: null }).addFields(
            { name: "Bot Latency", value: `${latency}ms`, inline: true },
            { name: "API Latency", value: `${apiLatency}ms`, inline: true },
        );

        await interaction.editReply({
            content: null,
            embeds: [embed],
        });
    },
};
