import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../config/bot.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logEvent as logModEvent } from '../utils/moderation.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { PunishmentService } from '../services/punishmentService.js';
import { logger } from '../utils/logger.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 days — Discord max

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        const welcomeChannelId = welcomeConfig?.channelId;

        if (welcomeConfig?.enabled && welcomeChannelId) {
            const channel = guild.channels.cache.get(welcomeChannelId);
            if (channel?.isTextBased?.()) {
                const me = guild.members.me;
                const permissions = me ? channel.permissionsFor(me) : null;
                if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                    return;
                }

                const formatData = { user, guild, member };
                const welcomeMessage = formatWelcomeMessage(
                    welcomeConfig.welcomeMessage || welcomeConfig.welcomeEmbed?.description || 'Welcome {user} to {server}!',
                    formatData
                );

                const messageContent = welcomeConfig.welcomePing ? user.toString() : null;

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.welcomeEmbed?.title || '🎉 Welcome!',
                    formatData
                );
                const embedFooter = welcomeConfig.welcomeEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.welcomeEmbed.footer, formatData)
                    : `Welcome to ${guild.name}!`;

                const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await channel.send({
                        content: messageContent || welcomeMessage
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(welcomeConfig.welcomeEmbed?.color || getColor('success'))
                        .setTitle(embedTitle)
                        .setDescription(welcomeMessage)
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });
                    
                    if (welcomeConfig.welcomeImage) {
                        embed.setImage(welcomeConfig.welcomeImage);
                    } else if (welcomeConfig.welcomeEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.welcomeEmbed.image.url);
                    }
                    
                    await channel.send({ 
                        content: messageContent,
                        embeds: [embed] 
                    });
                }
            }
        }
        
        if (welcomeConfig?.roleIds && welcomeConfig.roleIds.length > 0) {
            const delay = welcomeConfig.autoRoleDelay || 0;
            const singleRoleId = welcomeConfig.roleIds[0];
            
            if (delay > 0) {
                const timeout = setTimeout(async () => {
                    const role = guild.roles.cache.get(singleRoleId);
                    if (role) {
                        await assignRoleSafely(member, role);
                    }
                }, delay * 1000);
                if (typeof timeout.unref === 'function') {
                    timeout.unref();
                }
            } else {
                const role = guild.roles.cache.get(singleRoleId);
                if (role) {
                    await assignRoleSafely(member, role);
                }
            }
        }
        
        if (config?.verification?.enabled || config?.verification?.autoVerify?.enabled) {
            await handleVerification(member, guild, config.verification, member.client);
        }

        
        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_JOIN,
                data: {
                    description: `${user.tag} joined the server`,
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
                            name: '📅 Account Created',
                            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
                            inline: true
                        }
                    ]
                }
            });
        } catch (error) {
            logger.debug('Error logging member join:', error);
        }
        
        
        try {
            const counters = await getServerCounters(member.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.channelId && counter.enabled !== false) {
                    await updateCounter(member.client, guild, counter);
                }
            }
        } catch (error) {
            logger.debug('Error updating counters on member join:', error);
        }
        
        // Restore birthday data if the member previously left
        try {
            const backupKey = `guild:${guild.id}:birthdays:left`;
            const backup = (await member.client.db.get(backupKey)) || {};
            if (backup[user.id]) {
                const { month, day } = backup[user.id];
                await dbSetBirthday(member.client, guild.id, user.id, month, day);
                delete backup[user.id];
                await member.client.db.set(backupKey, backup);
                logger.debug(`Birthday restored for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error restoring birthday on member join:', error);
        }

        // Punishment evasion detection
        checkPunishmentEvasion(member, guild).catch(err =>
            logger.debug('Evasion check error:', err.message)
        );

    } catch (error) {
        logger.error('Error in guildMemberAdd event:', error);
    }
  }
};

/**
 * Check for punishment evasion when a member joins.
 * - Re-applies active timeouts (user left during timeout).
 * - Alerts moderators when previously banned/kicked users rejoin.
 * - Flags accounts less than 7 days old.
 */
async function checkPunishmentEvasion(member, guild) {
    const { user } = member;

    // 1. Re-apply active timeouts
    try {
        const active = await PunishmentService.getActive(guild.id, user.id);
        const activeTimeout = active.find(p => p.action === 'TIMEOUT');

        if (activeTimeout && member.moderatable) {
            const expiresAt = new Date(activeTimeout.expires_at || activeTimeout.expiresAt);
            const remaining = expiresAt.getTime() - Date.now();

            if (remaining > 0) {
                const applyMs = Math.min(remaining, MAX_TIMEOUT_MS);
                await member.timeout(applyMs, 'Auto-reapplied: timeout evasion prevention');
                logger.info(`Timeout re-applied for ${user.tag} in ${guild.name} (evasion prevention)`);

                await logModEvent({
                    client: member.client,
                    guild,
                    event: {
                        action: '⚠️ Timeout Evasion',
                        target: `${user.tag} (${user.id})`,
                        executor: 'TitanBot (Auto)',
                        reason: `User rejoined during active timeout. Auto-reapplied.\nOriginal reason: ${activeTimeout.reason || 'No reason provided'}`,
                        duration: `Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
                        color: 0xff6b00,
                    }
                });
            }
        }
    } catch (err) {
        logger.debug('Timeout evasion check failed:', err.message);
    }

    // 2. Alert mods when a previously banned/kicked user rejoins
    try {
        const history = await PunishmentService.getUserHistory(guild.id, user.id, 10);
        const severe = history.filter(p => p.action === 'BAN' || p.action === 'KICK');

        if (severe.length > 0) {
            const latest = severe[0];
            const ts = Math.floor(
                new Date(latest.created_at || latest.createdAt || Date.now()).getTime() / 1000
            );

            await logModEvent({
                client: member.client,
                guild,
                event: {
                    action: '⚠️ Previously Punished User Rejoined',
                    target: `${user.tag} (${user.id})`,
                    executor: 'TitanBot (Auto)',
                    reason: `User has **${severe.length}** prior ban/kick record(s).\nMost recent: **${latest.action}** — <t:${ts}:R>\nReason: ${latest.reason || 'No reason provided'}`,
                    color: 0xff0000,
                    metadata: {
                        totalRecords: `${severe.length} ban/kick(s)`,
                        'Run /history': `Use \`/history @${user.username}\` to review their full history`,
                    }
                }
            });
        }
    } catch (err) {
        logger.debug('Punishment history check failed:', err.message);
    }

    // 3. Flag new accounts (less than 7 days old)
    try {
        const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < 7) {
            await logModEvent({
                client: member.client,
                guild,
                event: {
                    action: '🆕 New Account Alert',
                    target: `${user.tag} (${user.id})`,
                    executor: 'TitanBot (Auto)',
                    reason: `Account is only **${accountAgeDays.toFixed(1)} days** old (under 7 days).`,
                    color: 0xffcc00,
                    metadata: {
                        'Account Age': `${accountAgeDays.toFixed(1)} days`,
                        'Created': `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
                    }
                }
            });
        }
    } catch (err) {
        logger.debug('New account check failed:', err.message);
    }
}

async function handleVerification(member, guild, verificationConfig, client) {
    const { autoVerifyOnJoin } = await import('../services/verificationService.js');
    
    try {
        const result = await autoVerifyOnJoin(client, guild, member, verificationConfig);
        
        if (result.autoVerified) {
            logger.info('User auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                userTag: member.user.tag,
                roleName: result.roleName,
                criteria: result.criteria
            });
        } else {
            logger.debug('User not auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                reason: result.reason
            });
        }

    } catch (error) {
        logger.error('Error in auto-verification for member', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            error: error.message
        });
    }
}

async function assignRoleSafely(member, role) {
    try {
        await member.roles.add(role);
    } catch (error) {
        logger.warn(`Failed to assign role ${role.id} to member ${member.id}:`, error);
    }
}



