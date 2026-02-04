import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks the bot's latency and API speed"),

    async execute(interaction) {
        try {
            // Note: the global interaction handler (`interactionCreate`) already calls
            // `interaction.deferReply()` for all chat input commands.
            // Once an interaction has been deferred, we must use `editReply`/`followUp`
            // instead of `reply`, otherwise Discord will throw
            // "The reply to this interaction has already been sent or deferred."

            // First update the deferred reply with a "Pinging..." message and get the message
            const reply = await interaction.editReply({
                content: "Pinging...",
            });

            const latency = reply.createdTimestamp - interaction.createdTimestamp;
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
        } catch (error) {
            console.error('Ping command error:', error);
            return interaction.reply({
                embeds: [createEmbed({ title: 'System Error', description: 'Could not determine latency at this time.' })],
                ephemeral: true,
            });
        }
    },
};
