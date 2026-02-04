import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { BotConfig } from '../../../config/bot.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';

export default {
    async execute(interaction, config, client) {

        const counterId = interaction.options.getString("counter_id");
        const { guild } = interaction;

        // Get existing counters
        const counters = await getServerCounters(client, guild.id);
        const counterIndex = counters.findIndex((c) => c.id === counterId);

        if (counterIndex === -1) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: BotConfig.counters?.messages?.counterNotFound || "Counter not found. Use `/counter list` to see available counters." }),
                ],
            });
        }

        // Remove the counter
        const [deletedCounter] = counters.splice(counterIndex, 1);
        let channelDeleted = false;

        try {
            // Delete the associated channel
            const channel = guild.channels.cache.get(deletedCounter.channelId);
            if (channel) {
                await channel.delete();
                channelDeleted = true;
                console.log(`Deleted channel ${deletedCounter.channelId} for counter ${counterId}`);
            } else {
                console.warn(`[WARN] Could not find channel ${deletedCounter.channelId} to delete for counter ${counterId}`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to delete channel for counter ${counterId}:`, error);
            // Continue with the deletion even if channel deletion fails
        }

        try {
            // Save the updated counters
            const saved = await saveServerCounters(client, guild.id, counters);

            if (!saved) {
                throw new Error("Failed to save updated counters");
            }

            // Format success message from config
            const successMessage =
                (BotConfig.counters?.messages?.counterDeleted || "✅ Deleted counter **{id}**").replace(
                    "{id}",
                    counterId,
                ) + (channelDeleted ? " The channel has been removed." : "");

            interaction.editReply({
                embeds: [
                    createEmbed({ title: "✅ Counter Deleted", description: successMessage }),
                ],
            });
        } catch (error) {
            console.error("Error deleting counter:", error);
            interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: `Failed to delete counter: ${error.message}` }),
                ],
            });
        }
    }
};
