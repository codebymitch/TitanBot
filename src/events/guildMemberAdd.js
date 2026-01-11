import { Events } from 'discord.js';
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
                let welcomeMessage = welcomeConfig.message || 'Welcome {user} to {server}!';
                welcomeMessage = welcomeMessage
                    .replace(/{user}/g, user.toString())
                    .replace(/{server}/g, guild.name)
                    .replace(/{membercount}/g, guild.memberCount);
                
                await channel.send({ content: welcomeMessage });
            }
        }
        
        // Handle auto-role if configured
        if (config?.autoRoleId) {
            const role = guild.roles.cache.get(config.autoRoleId);
            if (role) {
                await member.roles.add(role).catch(console.error);
            }
        }
        
    } catch (error) {
        console.error('Error in guildMemberAdd event:', error);
    }
  }
};
