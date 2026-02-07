import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks the bot's latency and API speed"),

    async execute(interaction) {
try {

            const reply = await interaction.reply({
                content: "Pinging...",
            });

            const latency = reply.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(interaction.client.ws.ping);

            const embed = createEmbed({ title: "🏓 Pong!", description: null }).addFields(
                { name: "Bot Latency", value: `${latency}ms`, inline: true },
                { name: "API Latency", value: `${apiLatency}ms`, inline: true },
            );

            await interaction.editReply({
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            console.error('Ping command error:', error);
            return interaction.editReply({
                embeds: [createEmbed({ title: 'System Error', description: 'Could not determine latency at this time.' })],
                ephemeral: true,
            });
        }
    },
};
