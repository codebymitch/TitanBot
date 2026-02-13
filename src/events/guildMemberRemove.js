import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
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
                
                const embed = new EmbedBuilder()
                    .setTitle(welcomeConfig.leaveEmbed?.title || '👋 Goodbye')
.setDescription(goodbyeMessage)
                    .setColor(welcomeConfig.leaveEmbed?.color || 0xff0000)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Goodbye from ${guild.name}!` });
                
                if (welcomeConfig.leaveEmbed?.image) {
                    embed.setImage(welcomeConfig.leaveEmbed.image.url);
                }
                
                await channel.send({ embeds: [embed] });
            }
        }
        
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



