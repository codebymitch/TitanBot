import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to create counters.' }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Please select a valid category for the counter channel.' }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '`A **${getCounterTypeLabel(type)}** counter already exists for this server${duplicateChannel ? ` in ${duplicateChannel}` : \'\'}. Delete it first before creating another.`' }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Counter channel created by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'A counter already exists for channel **${targetChannel.name}**. Please delete it first or choose a different type.' }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Counter creation failed during save').catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to save counter data. Please try again.' }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Counter created but failed to update channel name. The counter will update on the next scheduled run.' }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`**Counter Created Successfully!**\n\n**Type:** ${getCounterTypeLabel(type)}\n**Channel Type:** ${targetChannel.type === ChannelType.GuildVoice ? 'voice' : 'text'}\n**Category:** ${category}\n**Channel:** ${targetChannel}\n**Channel Name:** ${targetChannel.name}\n**Counter ID:** \`${newCounter.id}\`\n\nThe counter will automatically update every 15 minutes.\n\nUse \`/counter list\` to view all counters.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while creating the counter. Please try again.' }).catch(logger.error);
    }
}