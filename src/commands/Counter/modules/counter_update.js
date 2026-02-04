import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { BotConfig } from '../../../config/bot.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';

export default {
    async execute(interaction, config, client) {
        try {
            const { guild } = interaction;
            const counters = await getServerCounters(client, guild.id);

            if (counters.length === 0) {
                return interaction.editReply({
                    embeds: [
                        createEmbed({ title: "No Counters", description: "There are no counters to update." }),
                    ],
                });
            }

            // Update all counters
            const results = await Promise.all(
                counters.map((counter) => updateCounter(client, guild, counter)),
            );

            const successCount = results.filter((success) => success).length;

            interaction.editReply({
                embeds: [
                    createEmbed({ title: "Counters Updated", description: `Successfully updated ${successCount} out of ${counters.length} counters.` }),
                ],
            });
        } catch (error) {
            console.error('Counter update command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not update counters at this time.')],
                ephemeral: true,
            });
        }
    }
};
