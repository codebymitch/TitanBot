import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        // Get guild configuration
        const config = await getGuildConfig(member.client, guild.id);
        
        // Get welcome configuration
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        // If welcome messages are enabled and a channel is set
        if (welcomeConfig?.enabled && welcomeConfig.channelId) {
            const channel = guild.channels.cache.get(welcomeConfig.channelId);
            if (channel) {
                // Replace placeholders in the welcome message
                let welcomeMessage = welcomeConfig.welcomeMessage || 'Welcome {user} to {server}!';
                welcomeMessage = welcomeMessage
                    .replace(/{user}/g, user.toString())
                    .replace(/{username}/g, user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{membercount}/g, guild.memberCount);
                
                // Create welcome message content (for ping only, no message text)
                let messageContent = '';
                if (welcomeConfig.welcomePing) {
                    messageContent = user.toString();
                }
                
                // Create welcome embed with custom message
                const embed = new EmbedBuilder()
                    .setColor(0x00ff00) // Green color for welcome
                    .setTitle('🎉 Welcome!')
                    .setDescription(welcomeMessage) // Use custom message here
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Welcome to ${guild.name}!` });
                
                // Add image if configured
                if (welcomeConfig.welcomeImage) {
                    embed.setImage(welcomeConfig.welcomeImage);
                }
                
                await channel.send({ 
                    content: messageContent || null,
                    embeds: [embed] 
                });
            }
        }
        
        // Handle auto-roles if configured
        if (welcomeConfig?.roleIds && welcomeConfig.roleIds.length > 0) {
            // Add delay if configured
            const delay = welcomeConfig.autoRoleDelay || 0;
            
            if (delay > 0) {
                setTimeout(async () => {
                    for (const roleId of welcomeConfig.roleIds) {
                        const role = guild.roles.cache.get(roleId);
                        if (role) {
                            await member.roles.add(role).catch(() => {});
                        }
                    }
                }, delay * 1000);
            } else {
                // Add roles immediately
                for (const roleId of welcomeConfig.roleIds) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.add(role).catch(() => {});
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Error in guildMemberAdd event:', error);
    }
  }
};
