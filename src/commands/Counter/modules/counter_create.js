import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';

/**
 * Handle counter creation subcommand
 * @param {CommandInteraction} interaction - The command interaction
 * @param {Client} client - Discord client
 */
export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel");

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ 
            embeds: [errorEmbed("You need **Manage Channels** permission to create counters.")],
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    await interaction.deferReply();

    try {
        const counters = await getServerCounters(client, guild.id);

        let targetChannel;
        const channels = guild.channels.cache;
        
        if (channelType === "voice") {
            targetChannel = channels.find(c => c.type === ChannelType.GuildVoice);
        } else {
            targetChannel = channels.find(c => c.type === ChannelType.GuildText);
        }

        if (!targetChannel) {
            await interaction.editReply({
                embeds: [errorEmbed(`No ${channelType} channels found in this server.`)]
            });
            return;
        }

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await interaction.editReply({
                embeds: [errorEmbed(`A counter already exists for channel **${targetChannel.name}**. Please delete it first or choose a different channel type.`)]
            });
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString()
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await interaction.editReply({
                embeds: [errorEmbed("Failed to save counter data. Please try again.")]
            });
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await interaction.editReply({
                embeds: [errorEmbed("Counter created but failed to update channel name. The counter will update on the next scheduled run.")]
            });
            return;
        }

        const typeDisplay = {
            members: "members and bots",
            bots: "bots only",
            members_only: "members only"
        };

        await interaction.editReply({
            embeds: [successEmbed(`âœ… **Counter Created Successfully!**\n\n**Type:** ${typeDisplay[type]}\n**Channel Type:** ${channelType}\n**Channel:** ${targetChannel}\n**Channel Name:** ${targetChannel.name}\n**Counter ID:** \`${newCounter.id}\`\n\nThe counter will automatically update every 15 minutes.\n\nUse \`/counter list\` to view all counters.`)]
        });

    } catch (error) {
        console.error("Error creating counter:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while creating the counter. Please try again.")]
        });
    }
}

