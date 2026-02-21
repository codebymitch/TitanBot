import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters } from '../../../services/counterService.js';
import { logger } from '../../../utils/logger.js';






export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    
    // Defer reply immediately to ensure interaction is acknowledged
    try {
        await interaction.deferReply();
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    // Check permissions after deferring
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.editReply({ 
            embeds: [errorEmbed("You need **Manage Channels** permission to delete counters.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await interaction.editReply({
                embeds: [errorEmbed("No counters found to delete.")]
            }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await interaction.editReply({
                embeds: [errorEmbed(`Counter with ID \`${counterId}\` not found. Use \`/counter list\` to see all counters.`)]
            }).catch(logger.error);
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
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Confirm Delete")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Error in handleDelete:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while fetching counters. Please try again.")]
        }).catch(logger.error);
    }
}







export async function performDeletionByCounterId(client, guild, counterId) {
    try {
        const counters = await getServerCounters(client, guild.id);

        const counter = counters.find(c => c.id === counterId);
        if (!counter) {
            return {
                success: false,
                message: `Counter with ID \`${counterId}\` was not found.`
            };
        }

        const updatedCounters = counters.filter(c => c.id !== counter.id);

        const saved = await saveServerCounters(client, guild.id, updatedCounters);
        if (!saved) {
            return {
                success: false,
                message: "Failed to delete counter. Please try again."
            };
        }

        const channel = guild.channels.cache.get(counter.channelId);
        let channelDeleted = false;

        if (channel) {
            try {
                await channel.delete(`Counter deleted - removing channel: ${counter.id}`);
                channelDeleted = true;
            } catch (error) {
                logger.error("Error deleting channel:", error);
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

        return {
            success: true,
            message
        };

    } catch (error) {
        logger.error("Error deleting counter:", error);
        return {
            success: false,
            message: "An error occurred while deleting the counter. Please try again."
        };
    }
}






function getCounterTypeDisplay(type) {
    const types = {
        members: "👥 Members",
        bots: "🤖 Bots",
        members_only: "👤 Humans"
    };
    return types[type] || "❓ Unknown";
}



