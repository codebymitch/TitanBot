import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getServerCounters } from '../../../services/counterService.js';
import { logger } from '../../../utils/logger.js';






export async function handleList(interaction, client) {
    const guild = interaction.guild;
    
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
            embeds: [errorEmbed("You need **Manage Channels** permission to view counters.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            const embed = createEmbed({
                title: "📋 Server Counters",
                description: "No counters have been set up for this server yet.\n\nUse `/counter create` to set up your first counter!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "🔧 **Available Counter Types**",
                value: "👥 **Members** - Total server members\n🤖 **Bots** - Bot count only\n👤 **Humans** - Human members only",
                inline: false
            });

            embed.addFields({
                name: "📝 **Usage Examples**",
                value: "`/counter create type:members channel_type:voice category:Stats`\n`/counter create type:bots channel_type:text category:Server Info`\n`/counter list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Counter System • Automatic updates every 15 minutes" 
            });

            await interaction.editReply({ embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `📋 Server Counters (${counters.length})`,
            description: "Here are all the active counters for this server.\n\nCounters automatically update every 15 minutes.",
            color: getColor('info')
        });

        for (let i = 0; i < counters.length; i++) {
            const counter = counters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) {
                embed.addFields({
                    name: `❌ Counter #${i + 1} - Channel Missing`,
                    value: `**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}\n**Channel:** Deleted channel (ID: ${counter.channelId})\n**Status:** ⚠️ Channel no longer exists\n**Created:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                    inline: false
                });
                continue;
            }

            const currentCount = getCurrentCount(guild, counter.type);
            const status = channel.name.includes(':') ? '✅ Active' : '⚠️ Not Updated';
            
            embed.addFields({
                name: `${getCounterEmoji(counter.type)} Counter #${i + 1} - ${channel.name}`,
                value: `**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}\n**Channel:** ${channel}\n**Current Count:** ${currentCount}\n**Status:** ${status}\n**Created:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "📊 **Statistics**",
            value: `**Total Counters:** ${counters.length}\n**Active Counters:** ${counters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**Next Update:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "🔧 **Management Commands**",
            value: "`/counter create` - Create new counter\n`/counter update` - Update existing counter\n`/counter delete` - Delete counter",
            inline: false
        });

        embed.setFooter({ 
            text: "Counter System • Automatic updates every 15 minutes" 
        });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await interaction.editReply({
            embeds: [errorEmbed("An error occurred while fetching counters. Please try again.")]
        }).catch(logger.error);
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






function getCounterEmoji(type) {
    const emojis = {
        members: "👥",
        bots: "🤖",
        members_only: "👤"
    };
    return emojis[type] || "❓";
}







function getCurrentCount(guild, type) {
    switch (type) {
        case "members":
            return guild.memberCount;
        case "bots":
            return guild.members.cache.filter((m) => m.user.bot).size;
        case "members_only":
            return guild.members.cache.filter((m) => !m.user.bot).size;
        default:
            return 0;
    }
}



