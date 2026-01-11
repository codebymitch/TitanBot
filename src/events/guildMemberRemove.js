import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        // Get guild configuration
        const config = await getGuildConfig(member.client, guild.id);
        
        // Check if goodbye messages are enabled
        if (config?.goodbye?.enabled && config.goodbye.channelId) {
            const channel = guild.channels.cache.get(config.goodbye.channelId);
            if (channel) {
                let goodbyeMessage = config.goodbye.message || '{user} has left the server.';
                goodbyeMessage = goodbyeMessage
                    .replace(/{user}/g, user.toString())
                    .replace(/{server}/g, guild.name)
                    .replace(/{membercount}/g, guild.memberCount);
                
                await channel.send({ content: goodbyeMessage });
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
