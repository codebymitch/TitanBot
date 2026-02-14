import { Events, EmbedBuilder } from 'discord.js';
import { getWelcomeConfig } from '../utils/database.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
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
        
        // Log member leave event using unified logging service
        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_LEAVE,
                data: {
                    description: `${user.tag} left the server`,
                    userId: user.id,
                    fields: [
                        {
                            name: '👤 Member',
                            value: `${user.tag} (${user.id})`,
                            inline: true
                        },
                        {
                            name: '👥 Member Count',
                            value: guild.memberCount.toString(),
                            inline: true
                        },
                        {
                            name: '📅 Joined',
                            value: `<t:${Math.floor((member.joinedTimestamp || 0) / 1000)}:R>`,
                            inline: true
                        }
                    ]
                }
            });
        } catch (error) {
            console.debug('Error logging member leave:', error);
        }
        
    } catch (error) {
        console.error('Error in guildMemberRemove event:', error);
    }
  }
};



