import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    Events,
    ChannelType,
    PermissionFlagsBits
} from 'discord.js';
import { getColor } from './database.js';

const getWelcomeConfigKey = (guildId) => `welcome:${guildId}:config`;

/**
 * Get welcome system configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<Object>} The welcome system configuration
 */
export async function getWelcomeConfig(client, guildId) {
    try {
        if (!client.db || typeof client.db.get !== 'function') {
            return {};
        }

        const key = getWelcomeConfigKey(guildId);
        const rawConfig = await client.db.get(key, {});
        
        const defaultConfig = {
            enabled: false,
            channelId: null,
            message: 'Welcome {user.mention} to {guild.name}!',
            embed: {
                enabled: true,
                title: 'Welcome {user.username}!',
                description: 'Welcome to {guild.name}!',
                color: getColor('primary'),
                thumbnail: true,
                footer: 'Member #{guild.memberCount}'
            },
            autoRole: {
                enabled: false,
                roleId: null
            },
            dmMessage: {
                enabled: false,
                message: 'Thanks for joining {guild.name}!' 
            },
            joinLogs: {
                enabled: false,
                channelId: null
            },
            leaveLogs: {
                enabled: false,
                channelId: null
            },
            antiRaid: {
                enabled: false,
                maxJoins: 5,
                timeWindow: 10,
action: 'kick'
            },
joinRoles: []
        };

        return { ...defaultConfig, ...rawConfig };
    } catch (error) {
        console.error(`Error getting welcome config for guild ${guildId}:`, error);
        return {};
    }
}

/**
 * Save welcome system configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {Object} config - The configuration to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveWelcomeConfig(client, guildId, config) {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('Database not available');
        }

        const key = getWelcomeConfigKey(guildId);
        await client.db.set(key, config);
        return true;
    } catch (error) {
        console.error(`Error saving welcome config for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Update specific fields in the welcome config
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} The updated config
 */
export async function updateWelcomeConfig(client, guildId, updates) {
    try {
        const currentConfig = await getWelcomeConfig(client, guildId);
        const newConfig = { ...currentConfig, ...updates };
        
        await saveWelcomeConfig(client, guildId, newConfig);
        return newConfig;
    } catch (error) {
        console.error(`Error updating welcome config for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Format a welcome message with placeholders
 * @param {string} message - The message template
 * @param {Object} data - The data to replace placeholders with
 * @returns {string} The formatted message
 */
export function formatWelcomeMessage(message, data) {
    if (!message) return '';
    
    const placeholders = {
        '{user.mention}': data.user?.toString(),
        '{user.tag}': data.user?.tag,
        '{user.username}': data.user?.username,
        '{user.discriminator}': data.user?.discriminator,
        '{user.id}': data.user?.id,
        
        '{guild.name}': data.guild?.name,
        '{guild.id}': data.guild?.id,
        '{guild.memberCount}': data.guild?.memberCount,
        
        '{inviter.mention}': data.inviter?.toString(),
        '{inviter.tag}': data.inviter?.tag,
        '{inviter.username}': data.inviter?.username,
        '{inviter.id}': data.inviter?.id,
        '{invite.code}': data.invite?.code,
        '{invite.uses}': data.invite?.uses
    };
    
    let result = message;
    for (const [key, value] of Object.entries(placeholders)) {
        if (value !== undefined) {
            result = result.replace(new RegExp(key, 'g'), value);
        }
    }
    
    return result;
}

export const handleGuildMemberAdd = {
    name: Events.GuildMemberAdd,
    
    /**
     * Execute the guild member add event
     * @param {import('discord.js').GuildMember} member - The member that joined
     */
    async execute(member) {
        try {
            const { client, guild } = member;
            const config = await getWelcomeConfig(client, guild.id);
            
            if (!config.enabled) return;
            
            if (config.autoRole?.enabled && config.autoRole.roleId) {
                try {
                    const role = await guild.roles.fetch(config.autoRole.roleId);
                    if (role) {
                        await member.roles.add(role, 'Auto-role on join');
                    }
                } catch (error) {
                    console.error(`Failed to add auto-role to ${member.id}:`, error);
                }
            }
            
            if (config.channelId) {
                try {
                    const channel = await guild.channels.fetch(config.channelId);
                    if (channel) {
                        const message = formatWelcomeMessage(config.message, {
                            user: member.user,
                            guild: guild,
                            member: member
                        });
                        
                        if (config.embed?.enabled) {
                            const embed = new EmbedBuilder()
                                .setTitle(formatWelcomeMessage(config.embed.title || 'Welcome {user.username}!', {
                                    user: member.user,
                                    guild: guild
                                }))
                                .setDescription(formatWelcomeMessage(config.embed.description || 'Welcome to {guild.name}!', {
                                    user: member.user,
                                    guild: guild
                                }))
                                .setColor(config.embed.color || getColor('primary'))
                                .setFooter({
                                    text: formatWelcomeMessage(config.embed.footer || 'Member #{guild.memberCount}', {
                                        user: member.user,
                                        guild: guild
                                    })
                                })
                                .setTimestamp();
                            
                            if (config.embed.thumbnail) {
                                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
                            }
                            
                            await channel.send({
                                content: message,
                                embeds: [embed]
                            });
                        } else {
                            await channel.send(message);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to send welcome message for ${member.id}:`, error);
                }
            }
            
            if (config.dmMessage?.enabled && config.dmMessage.message) {
                try {
                    await member.send(
                        formatWelcomeMessage(config.dmMessage.message, {
                            user: member.user,
                            guild: guild
                        })
                    );
                } catch (error) {
                    console.error(`Failed to send DM to ${member.id}:`, error);
                }
            }
            
            if (config.joinLogs?.enabled && config.joinLogs.channelId) {
                try {
                    const logChannel = await guild.channels.fetch(config.joinLogs.channelId);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('Member Joined')
                            .setColor(getColor('success'))
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                            .addFields(
                                { name: 'User', value: `${member.user.tag} (${member.id})`, inline: true },
                                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                                { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                            )
                            .setTimestamp();
                        
                        await logChannel.send({ embeds: [embed] });
                    }
                } catch (error) {
                    console.error(`Failed to log join for ${member.id}:`, error);
                }
            }
            
        } catch (error) {
            console.error('Error in guildMemberAdd handler:', error);
        }
    }
};

export const handleGuildMemberRemove = {
    name: Events.GuildMemberRemove,
    
    /**
     * Execute the guild member remove event
     * @param {import('discord.js').GuildMember} member - The member that left
     */
    async execute(member) {
        try {
            const { client, guild } = member;
            const config = await getWelcomeConfig(client, guild.id);
            
            if (!config.leaveLogs?.enabled || !config.leaveLogs.channelId) return;
            
            try {
                const logChannel = await guild.channels.fetch(config.leaveLogs.channelId);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Member Left')
                        .setColor(getColor('error'))
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: 'User', value: `${member.user.tag} (${member.id})`, inline: true },
                            { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                            { name: 'Member Since', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
                            { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp();
                    
                    await logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error(`Failed to log leave for ${member.id}:`, error);
            }
            
        } catch (error) {
            console.error('Error in guildMemberRemove handler:', error);
        }
    }
};


