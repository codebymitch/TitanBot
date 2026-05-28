import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { BotConfig } from '../config/bot.js';
import { createPrefixInteraction, parsePrefixContent } from '../utils/prefixCommandAdapter.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { getFromDb } from '../utils/database.js';

const DEFAULT_PREFIX = BotConfig.prefix || 'nh!';

// Format time duration in human readable format
function formatAfkDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // Check for AFK mentions
        if (message.mentions.has(client.user.id) || message.mentions.users.size > 0) {
            const afkNotifications = [];
            
            for (const mentionedUser of message.mentions.users.values()) {
                try {
                    const afkKey = `afk:${message.guildId}:${mentionedUser.id}`;
                    const afkData = await getFromDb(afkKey);
                    
                    if (afkData) {
                        const currentTime = Date.now();
                        const afkDuration = formatAfkDuration(currentTime - afkData.timestamp);
                        
                        afkNotifications.push(
                            `💤 **${afkData.username}** has been AFK for **${afkDuration}** | Reason: ${afkData.message}`
                        );
                    }
                } catch (err) {
                    logger.warn(`Failed to check AFK status for ${mentionedUser.tag}:`, err);
                }
            }
            
            if (afkNotifications.length > 0) {
                try {
                    await message.reply({
                        content: afkNotifications.join('\n'),
                        flags: MessageFlags.SuppressEmbeds,
                    }).catch(() => {});
                } catch (err) {
                    logger.warn('Failed to send AFK notification:', err);
                }
            }
        }

        const guildConfig = await getGuildConfig(client, message.guild.id);
        const prefix = guildConfig.prefix || DEFAULT_PREFIX;

        const parsed = parsePrefixContent(message.content, prefix);
        if (!parsed) return;

        const command = client.commands.get(parsed.commandName);
        if (!command) return;

        const resolvedName = command.data?.name ?? parsed.commandName;

        const fakeInteraction = createPrefixInteraction(
            message,
            client,
            command,
            resolvedName,
            parsed.args,
        );

        const abuse = await enforceAbuseProtection(fakeInteraction, command, resolvedName);
        if (!abuse.allowed) {
            await InteractionHelper.safeReply(fakeInteraction, {
                content: `⏱️ Slow down! Try again in ${formatCooldownDuration(abuse.remainingMs)}.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            await command.execute(fakeInteraction, guildConfig, client);
        } catch (error) {
            logger.error(`Prefix command "${resolvedName}" failed:`, error);
            if (!fakeInteraction.replied) {
                await message
                    .reply('❌ Command failed. Try the slash version (/) for full features (menus, modals, etc.).')
                    .catch(() => {});
            }
        }
    },
};
