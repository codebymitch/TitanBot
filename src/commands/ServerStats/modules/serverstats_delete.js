import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, createError, wrapServiceBoundary } from '../../../utils/errorHandler.js';
export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to delete counters.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'No counters found to delete.' }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` not found. Use \`/serverstats list\` to see all counters.` }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "Delete Counter & Channel",
            description: `Are you sure you want to delete this counter and its channel?\n\n**ID:** \`${counterToDelete.id}\`\n**Type:** ${getCounterTypeDisplay(counterToDelete.type)}\n**Channel:** ${channel || 'Deleted Channel'}\n\n **The channel will be permanently deleted!**`,
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

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Error in handleDelete:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while fetching counters. Please try again.' }).catch(logger.error);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(async function performDeletionByCounterId(client, guild, counterId) {
    const counters = await getServerCounters(client, guild.id);

    const counter = counters.find(c => c.id === counterId);
    if (!counter) {
        throw createError(
            'Counter not found',
            ErrorTypes.USER_INPUT,
            `Counter with ID \`${counterId}\` was not found.`,
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const updatedCounters = counters.filter(c => c.id !== counter.id);

    const saved = await saveServerCounters(client, guild.id, updatedCounters);
    if (!saved) {
        throw createError(
            'Counter delete failed',
            ErrorTypes.DATABASE,
            'Failed to delete counter. Please try again.',
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
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

    return { message };
}, {
    service: 'serverstats',
    operation: 'performDeletionByCounterId',
    userMessage: 'An error occurred while deleting the counter. Please try again.',
});

function getCounterTypeDisplay(type) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}