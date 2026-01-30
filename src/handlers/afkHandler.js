import { EmbedBuilder } from 'discord.js';
import { getAFKStatus, removeAFKStatus } from '../utils/afk.js';

/**
 * Handle AFK mentions in messages
 * @param {import('discord.js').Message} message - The message that was created
 * @param {import('discord.js').Client} client - The Discord client
 */
export async function handleAFKMentions(message, client) {
    // Ignore bot messages and messages without mentions
    if (message.author.bot || !message.mentions.users.size) return;

    const guildId = message.guild.id;
    const mentionedUsers = message.mentions.users.filter(user => !user.bot);

    if (!mentionedUsers.size) return;

    const afkResponses = [];

    // Check each mentioned user for AFK status
    for (const [userId, mentionedUser] of mentionedUsers) {
        const afkData = await getAFKStatus(client, guildId, userId);
        
        if (afkData) {
            const timeAgo = getTimeAgo(afkData.timestamp);
            const displayName = mentionedUser.username;
            
            afkResponses.push({
                user: mentionedUser,
                reason: afkData.reason,
                timeAgo: timeAgo
            });

            // Auto-remove AFK status if the AFK user speaks
            if (userId === message.author.id) {
                await removeAFKStatus(client, guildId, userId);
                
                // Remove AFK prefix from nickname
                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (member && member.nickname && member.nickname.startsWith('[AFK] ')) {
                    const originalNickname = member.nickname.replace('[AFK] ', '');
                    await member.setNickname(originalNickname).catch(() => {});
                }

                // Send welcome back message
                const welcomeEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('✅ Welcome Back!')
                    .setDescription(`Welcome back ${message.author.toString()}! I've automatically removed your AFK status.`)
                    .setTimestamp();

                await message.reply({ embeds: [welcomeEmbed], allowedMentions: { users: [] } }).catch(() => {});
                return; // Don't send AFK responses if user is returning
            }
        }
    }

    // Send AFK responses if any AFK users were mentioned
    if (afkResponses.length > 0) {
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🌙 AFK User(s) Mentioned')
            .setDescription(`The following user(s) are currently AFK:`);

        afkResponses.forEach((afk, index) => {
            embed.addFields({
                name: `${index + 1}. ${afk.user.username}`,
                value: `💭 **Reason:** ${afk.reason}\n⏰ **AFK Since:** ${afk.timeAgo}`,
                inline: false
            });
        });

        embed.setFooter({
            text: 'Use /afk to set your own AFK status'
        });

        await message.reply({ 
            embeds: [embed], 
            allowedMentions: { users: [], repliedUser: false } 
        }).catch(() => {});
    }
}

/**
 * Get a human-readable time ago string
 * @param {number} timestamp - The timestamp in milliseconds
 * @returns {string} Time ago string
 */
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}
