import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        // Get guild configuration
        const config = await getGuildConfig(member.client, guild.id);
        
        // Get welcome configuration (includes goodbye messages)
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        // Check if goodbye messages are enabled
        if (welcomeConfig?.goodbyeEnabled && welcomeConfig?.goodbyeChannelId) {
            const channel = guild.channels.cache.get(welcomeConfig.goodbyeChannelId);
            if (channel) {
                let goodbyeMessage = welcomeConfig.leaveMessage || '{user.tag} has left the server.';
                goodbyeMessage = goodbyeMessage
                    .replace(/{user}/g, user.toString())
                    .replace(/{user\.tag}/g, user.tag)
                    .replace(/{username}/g, user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{membercount}/g, guild.memberCount);
                
                // Always use embed with custom message
                const embed = new EmbedBuilder()
                    .setTitle(welcomeConfig.leaveEmbed?.title || '👋 Goodbye')
                    .setDescription(goodbyeMessage) // Use custom message
                    .setColor(welcomeConfig.leaveEmbed?.color || 0xff0000)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Goodbye from ${guild.name}!` });
                
                // Add image if configured in leaveEmbed
                if (welcomeConfig.leaveEmbed?.image) {
                    embed.setImage(welcomeConfig.leaveEmbed.image.url);
                }
                
                await channel.send({ embeds: [embed] });
            }
        }
        
        // Log to moderation log channel if configured
        if (config?.logChannelId) {
            const logChannel = guild.channels.cache.get(config.logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('Member Left')
                    .setColor('#FF0000')
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Joined Server', value: `<t:${Math.floor((member.joinedTimestamp || 0) / 1000)}:R>`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Member Left' });
                
                await logChannel.send({ embeds: [embed] });
            }
        }
        
    } catch (error) {
        console.error('Error in guildMemberRemove event:', error);
    }
  }
};
