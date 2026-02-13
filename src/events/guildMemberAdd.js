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
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        if (welcomeConfig?.enabled && welcomeConfig.channelId) {
            const channel = guild.channels.cache.get(welcomeConfig.channelId);
            if (channel) {
                let welcomeMessage = welcomeConfig.welcomeMessage || 'Welcome {user} to {server}!';
                welcomeMessage = welcomeMessage
                    .replace(/{user}/g, user.toString())
                    .replace(/{username}/g, user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{membercount}/g, guild.memberCount);
                
                let messageContent = '';
                if (welcomeConfig.welcomePing) {
                    messageContent = user.toString();
                }
                
                const embed = new EmbedBuilder()
.setColor(0x00ff00)
                    .setTitle('🎉 Welcome!')
.setDescription(welcomeMessage)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Welcome to ${guild.name}!` });
                
                if (welcomeConfig.welcomeImage) {
                    embed.setImage(welcomeConfig.welcomeImage);
                }
                
                await channel.send({ 
                    content: messageContent || null,
                    embeds: [embed] 
                });
            }
        }
        
        if (welcomeConfig?.roleIds && welcomeConfig.roleIds.length > 0) {
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
                for (const roleId of welcomeConfig.roleIds) {
                    const role = guild.roles.cache.get(roleId);
                    if (role) {
                        await member.roles.add(role).catch(() => {});
                    }
                }
            }
        }
        
        if (config?.verification?.enabled) {
            await handleVerification(member, guild, config.verification, member.client);
        }
        
    } catch (error) {
        console.error('Error in guildMemberAdd event:', error);
    }
  }
};

async function handleVerification(member, guild, verificationConfig, client) {
    try {
        if (!verificationConfig.autoVerify?.enabled) {
            return;
        }

        let shouldVerify = false;
        const autoVerify = verificationConfig.autoVerify;

        switch (autoVerify.criteria) {
            case "account_age":
                const accountAge = Date.now() - member.user.createdTimestamp;
                const requiredAge = autoVerify.accountAgeDays * 24 * 60 * 60 * 1000;
                shouldVerify = accountAge >= requiredAge;
                break;
            
            case "server_size":
                shouldVerify = guild.memberCount < 1000;
                break;
            
            case "none":
                shouldVerify = true;
                break;
        }

        if (shouldVerify) {
            const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
            
            if (verifiedRole && guild.members.me.permissions.has("ManageRoles")) {
                const botRole = guild.members.me.roles.highest;
                if (verifiedRole.position < botRole.position) {
                    await member.roles.add(verifiedRole.id, "Auto-verified on join");
                    console.log(`✅ Auto-verified ${member.user.tag} (${member.id}) in ${guild.name}`);
                    
                    try {
                        await member.send({
                            embeds: [{
                                title: "🎉 Welcome to the Server!",
                                description: `You have been automatically verified in **${guild.name}**! You now have access to all server channels and features.`,
                                color: 0x00FF00
                            }]
                        });
                    } catch (error) {
                        console.log(`Could not send auto-verification DM to ${member.user.tag}: ${error.message}`);
                    }
                } else {
                    console.warn(`Cannot auto-verify ${member.user.tag}: Verified role is higher than bot's highest role`);
                }
            } else {
                console.warn(`Cannot auto-verify ${member.user.tag}: Missing verified role or ManageRoles permission`);
            }
        }

    } catch (error) {
        console.error(`Error in auto-verification for ${member.user.tag}:`, error);
    }
}



