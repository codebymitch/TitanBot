import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getServerCounters, saveServerCounters } from '../../services/counterService.js';
import { BotConfig } from '../../config/bot.js';

// Migrated from: commands/Counter/counterdelete.js
export default {
    data: new SlashCommandBuilder()
        .setName("counterdelete")
        .setDescription("Delete a server stats counter")
        .addStringOption((option) =>
            option
                .setName("counter_id")
                .setDescription(
                    "The ID of the counter to delete (use /counterlist to find IDs)",
                )
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "Counter",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const counterId = interaction.options.getString("counter_id");
        const { guild } = interaction;

        // Get existing counters
        const counters = await getServerCounters(client, guild.id);
        const counterIndex = counters.findIndex((c) => c.id === counterId);

        if (counterIndex === -1) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: BotConfig.counters?.messages?.counterNotFound || "Counter not found. Use `/counterlist` to see available counters." }),
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
                console.log(
                );
            } else {
                console.warn(
                    `[WARN] Could not find channel ${deletedCounter.channelId} to delete for counter ${counterId}`,
                );
            }
        } catch (error) {
            console.error(
                `[ERROR] Failed to delete channel for counter ${counterId}:`,
                error,
            );
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
    },
};
