import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';
import { logger } from '../../../utils/logger.js';






export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

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
            embeds: [errorEmbed("You need **Manage Channels** permission to create counters.")]
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await interaction.editReply({
                embeds: [errorEmbed("Please select a valid category for the counter channel.")]
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseNameMap = {
            members: 'Members',
            bots: 'Bots',
            members_only: 'Humans'
        };
        const baseChannelName = baseNameMap[type] || 'Counter';

        const counters = await getServerCounters(client, guild.id);

        const duplicateInCategory = counters.find(counter => {
            if (counter.type !== type) return false;
            const existingChannel = guild.channels.cache.get(counter.channelId);
            return existingChannel?.parentId === category.id;
        });

        if (duplicateInCategory) {
            await interaction.editReply({
                embeds: [errorEmbed(`A **${type.replace('_', ' ')}** counter already exists in ${category}. `)]
            }).catch(logger.error);
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
            await interaction.editReply({
                embeds: [errorEmbed(`A counter already exists for channel **${targetChannel.name}**. Please delete it first or choose a different type.`)]
            }).catch(logger.error);
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
            await interaction.editReply({
                embeds: [errorEmbed("Failed to save counter data. Please try again.")]
            }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await interaction.editReply({
                embeds: [errorEmbed("Counter created but failed to update channel name. The counter will update on the next scheduled run.")]
            }).catch(logger.error);
            return;
        }

        const typeDisplay = {
            members: "members and bots",
            bots: "bots only",
            members_only: "members only"
        };

        await interaction.editReply({
            embeds: [successEmbed(`✅ **Counter Created Successfully!**\n\n**Type:** ${typeDisplay[type]}\n**Channel Type:** ${targetChannel.type === ChannelType.GuildVoice ? 'voice' : 'text'}\n**Category:** ${category}\n**Channel:** ${targetChannel}\n**Channel Name:** ${targetChannel.name}\n**Counter ID:** \`${newCounter.id}\`\n\nThe counter will automatically update every 15 minutes.\n\nUse \`/counter list\` to view all counters.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while creating the counter. Please try again.")]
        }).catch(logger.error);
    }
}



