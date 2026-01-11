import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Counter/counterupdate.js
export default {
    data: new SlashCommandBuilder()
        .setName("counterupdate")
        .setDescription("Update all server stats counters")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "ServerStats",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        const { guild } = interaction;
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "No Counters",
                        "There are no counters to update.",
                    ),
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
                createEmbed(
                    "Counters Updated",
                    `Successfully updated ${successCount} out of ${counters.length} counters.`,
                ),
            ],
        });
    },
};
