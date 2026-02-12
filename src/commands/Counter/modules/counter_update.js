import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';

/**
 * Handle counter update subcommand
 * @param {CommandInteraction} interaction - The command interaction
 * @param {Client} client - Discord client
 */
export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");
    const newChannel = interaction.options.getChannel("channel");

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ 
            embeds: [errorEmbed("You need **Manage Channels** permission to update counters.")],
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    if (newChannel && newChannel.type !== ChannelType.GuildText && newChannel.type !== ChannelType.GuildVoice) {
        await interaction.reply({
            embeds: [errorEmbed("Counters can only be placed on text or voice channels.")],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (!newType && !newChannel) {
        await interaction.reply({
            embeds: [errorEmbed("You must provide at least one option to update (type or channel).")],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply();

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await interaction.editReply({
                embeds: [errorEmbed(`Counter with ID \`${counterId}\` not found. Use \`/counter list\` to see all counters.`)]
            });
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await interaction.editReply({
                embeds: [errorEmbed("The channel for this counter no longer exists. You cannot update a counter for a deleted channel.")]}
            );
            return;
        }

        if (newChannel && newChannel.id !== counter.channelId) {
            const existingCounter = counters.find(c => c.channelId === newChannel.id);
            if (existingCounter) {
                await interaction.editReply({
                    embeds: [errorEmbed("The selected channel already has a counter. Please choose a different channel.")]}
                );
                return;
            }
        }

        const oldType = counter.type;
        const oldChannelId = counter.channelId;

        if (newType) counter.type = newType;
        if (newChannel) counter.channelId = newChannel.id;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await interaction.editReply({
                embeds: [errorEmbed("Failed to save updated counter data. Please try again.")]}
            );
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await interaction.editReply({
                embeds: [errorEmbed("Counter updated but failed to update channel name. The counter will update on the next scheduled run.")]}
            );
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);
        const typeEmoji = {
            members: "ðŸ‘¥",
            bots: "ðŸ¤–", 
            members_only: "ðŸ‘¤"
        };

        const typeDisplay = {
            members: "Members",
            bots: "Bots",
            members_only: "Humans"
        };

        const changes = [];
        if (newType && newType !== oldType) {
            changes.push(`**Type:** ${typeEmoji[oldType]} ${typeDisplay[oldType]} â†’ ${typeEmoji[newType]} ${typeDisplay[newType]}`);
        }
        if (newChannel && newChannel.id !== oldChannelId) {
            changes.push(`**Channel:** ${oldChannel} â†’ ${finalChannel}`);
        }

        await interaction.editReply({
            embeds: [successEmbed(`âœ… **Counter Updated Successfully!**\n\n**Counter ID:** \`${counterId}\`\n\n${changes.join('\n')}\n\n**New Settings:**\n**Type:** ${typeEmoji[updatedCounter.type]} ${typeDisplay[updatedCounter.type]}\n**Channel:** ${finalChannel}\n**Channel Name:** ${finalChannel.name}\n\nThe counter will automatically update every 15 minutes.`)]
        });

    } catch (error) {
        console.error("Error updating counter:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while updating the counter. Please try again.")]}
        );
    }
}

