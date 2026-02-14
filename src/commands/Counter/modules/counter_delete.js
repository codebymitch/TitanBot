import { getColor } from '../../../config/bot.js';
﻿import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters } from '../../../services/counterService.js';

/**
 * Handle counter deletion subcommand
 * @param {CommandInteraction} interaction - The command interaction
 * @param {Client} client - Discord client
 */
export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ 
            embeds: [errorEmbed("You need **Manage Channels** permission to delete counters.")],
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    await interaction.deferReply();

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await interaction.editReply({
                embeds: [errorEmbed("No counters found to delete.")]}
            );
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await interaction.editReply({
                embeds: [errorEmbed(`Counter with ID \`${counterId}\` not found. Use \`/counter list\` to see all counters.`)]}
            );
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "⚠️ Delete Counter & Channel",
            description: `Are you sure you want to delete this counter and its channel?\n\n**ID:** \`${counterToDelete.id}\`\n**Type:** ${getCounterTypeDisplay(counterToDelete.type)}\n**Channel:** ${channel || 'Deleted Channel'}\n\n⚠️ **The channel will be permanently deleted!**`,
            color: getColor('error')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_${counterToDelete.id}`)
                .setLabel("Confirm Delete")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_delete_${counterToDelete.id}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });

        const filter = (i) => i.user.id === interaction.user.id && i.customId.includes(counterToDelete.id);
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            componentType: ComponentType.Button,
time: 30000,
            max: 1
        });

        collector.on("collect", async (i) => {
            try {
                if (i.customId === `confirm_delete_${counterToDelete.id}`) {
                    await i.update({ content: "Deleting counter...", components: [] });
                    await performDeletion(interaction, client, guild, counterToDelete);
                } else if (i.customId === `cancel_delete_${counterToDelete.id}`) {
                    await i.update({
                        embeds: [createEmbed({ 
                            title: "❌ Cancelled", 
                            description: "Counter deletion cancelled.",
                            color: getColor('error')
                        })],
                        components: []
                    });
                }
            } catch (error) {
                console.error("Error in button interaction:", error);
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size === 0) {
                await interaction.editReply({
                    embeds: [createEmbed({ 
                        title: "❌ Cancelled", 
                        description: "Counter deletion cancelled - no confirmation received.",
                        color: getColor('error')
                    })],
                    components: []
                });
            }
        });

    } catch (error) {
        console.error("Error in handleDelete:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while fetching counters. Please try again.")]}
        );
    }
}

/**
 * Perform the actual counter deletion
 * @param {CommandInteraction} interaction - The command interaction
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {Object} counter - The counter to delete
 */
async function performDeletion(interaction, client, guild, counter) {
    try {
        const counters = await getServerCounters(client, guild.id);

        const updatedCounters = counters.filter(c => c.id !== counter.id);

        const saved = await saveServerCounters(client, guild.id, updatedCounters);
        if (!saved) {
            await interaction.followUp({
                embeds: [errorEmbed("Failed to delete counter. Please try again.")],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const channel = guild.channels.cache.get(counter.channelId);
        let channelDeleted = false;

        if (channel) {
            try {
                await channel.delete(`Counter deleted - removing channel: ${counter.id}`);
                channelDeleted = true;
            } catch (error) {
                console.error("Error deleting channel:", error);
            }
        }

        let message = `✅ **Counter Deleted Successfully!**\n\n**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}`;
        
        if (channelDeleted) {
            message += `\n**Channel:** ${channel.name} (deleted)`;
        } else if (channel) {
            message += `\n**Channel:** ${channel.name} (failed to delete)`;
        } else {
            message += `\n**Channel:** Already deleted`;
        }

        await interaction.followUp({
            embeds: [successEmbed(message)]
        });

    } catch (error) {
        console.error("Error deleting counter:", error);
        await interaction.followUp({
            embeds: [errorEmbed("An error occurred while deleting the counter. Please try again.")],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Get display name for counter type
 * @param {string} type - Counter type
 * @returns {string} Display name
 */
function getCounterTypeDisplay(type) {
    const types = {
        members: "👥 Members",
        bots: "🤖 Bots",
        members_only: "👤 Humans"
    };
    return types[type] || "❓ Unknown";
}



