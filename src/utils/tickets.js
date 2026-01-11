import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    PermissionFlagsBits 
} from 'discord.js';
import { getColor } from './database.js';

/**
 * Generates priority map from BotConfig for ticket priorities.
 * @returns {Object} Priority map with name, color, emoji, and label
 */
export function getPriorityMap() {
    const priorities = BotConfig.tickets?.priorities || {};
    const map = {};

    for (const [key, config] of Object.entries(priorities)) {
        map[key] = {
            name: `${config.emoji} ${config.label.toUpperCase()}`,
            color: config.color,
            emoji: config.emoji,
            label: config.label,
        };
    }

    return map;
}

const PRIORITY_MAP = getPriorityMap();

/**
 * Gets the database key for a ticket
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The ticket channel ID
 * @returns {string} The database key
 */
export function getTicketKey(guildId, channelId) {
    return `ticket:${guildId}:${channelId}`;
}

/**
 * Checks if a channel is a ticket channel
 * @param {import('discord.js').TextChannel} channel - The channel to check
 * @returns {boolean} Whether the channel is a ticket
 */
export function isTicketChannel(channel) {
    return channel?.name?.startsWith('ticket-') || 
           channel?.topic?.includes('Ticket ID:');
}

/**
 * Gets the ticket message from a channel
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @returns {Promise<import('discord.js').Message|null>} The ticket message or null
 */
export async function getTicketMessage(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 1 });
        return messages.first() || null;
    } catch (error) {
        console.error(`Error fetching ticket message for channel ${channel.id}:`, error);
        return null;
    }
}

/**
 * Gets the claimer ID from a ticket embed
 * @param {import('discord.js').Message} message - The message containing the ticket embed
 * @returns {string|null} The claimer ID or null if not found
 */
export function getClaimerIdFromEmbed(message) {
    try {
        if (!message.embeds || message.embeds.length === 0) return null;
        
        const embed = message.embeds[0];
        const claimedField = embed.fields?.find(f => f.name === 'Status' && f.value.includes('Claimed by'));
        
        if (!claimedField) return null;
        
        const match = claimedField.value.match(/<@!(\d+)>/);
        return match ? match[1] : null;
    } catch (error) {
        console.error('Error getting claimer ID from embed:', error);
        return null;
    }
}

/**
 * Gets the status of a ticket
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @returns {Promise<Object>} Ticket status information
 */
export async function getTicketStatus(channel) {
    try {
        const message = await getTicketMessage(channel);
        if (!message) return { isOpen: false, isClaimed: false };
        
        const embed = message.embeds?.[0];
        if (!embed) return { isOpen: false, isClaimed: false };
        
        const statusField = embed.fields?.find(f => f.name === 'Status');
        if (!statusField) return { isOpen: true, isClaimed: false };
        
        const isOpen = !statusField.value.includes('Closed');
        const isClaimed = statusField.value.includes('Claimed by');
        
        return { isOpen, isClaimed };
    } catch (error) {
        console.error(`Error getting status for ticket ${channel.id}:`, error);
        return { isOpen: false, isClaimed: false };
    }
}

/**
 * Updates the ticket message with current status
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @param {Object} options - Update options
 * @param {boolean} [options.isClaimed] - Whether the ticket is claimed
 * @param {import('discord.js').User} [options.claimer] - The user who claimed the ticket
 * @param {boolean} [options.isClosed] - Whether the ticket is closed
 * @param {import('discord.js').User} [options.closer] - The user who closed the ticket
 * @param {string} [options.priority] - The ticket priority
 * @returns {Promise<import('discord.js').Message>} The updated message
 */
export async function updateTicketMessage(channel, options = {}) {
    const {
        isClaimed = false,
        claimer = null,
        isClosed = false,
        closer = null,
        priority = 'medium'
    } = options;

    try {
        const message = await getTicketMessage(channel);
        if (!message) throw new Error('No ticket message found');

        const embed = message.embeds[0] || new EmbedBuilder();
        const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
        
        // Update status field
        let statusText = '\n\n**Status**\n';
        
        if (isClosed) {
            statusText += `🔒 Closed${closer ? ` by ${closer}` : ''}`;
        } else if (isClaimed && claimer) {
            statusText += `🔑 Claimed by ${claimer}`;
        } else {
            statusText += '🟢 Open';
        }
        
        // Add priority if provided
        if (priority) {
            statusText += `\n\n**Priority**\n${priorityInfo.emoji} ${priorityInfo.label}`;
        }

        // Update or add status field
        const fields = embed.data.fields || [];
        const statusFieldIndex = fields.findIndex(f => f.name === 'Status');
        
        if (statusFieldIndex >= 0) {
            fields[statusFieldIndex].value = statusText;
        } else {
            fields.push({ name: 'Status', value: statusText, inline: false });
        }

        // Update embed
        embed.setFields(fields);
        
        // Update color based on status
        if (isClosed) {
            embed.setColor(getColor('error'));
        } else if (isClaimed) {
            embed.setColor(getColor('warning'));
        } else {
            embed.setColor(priorityInfo.color || getColor('primary'));
        }

        // Create action buttons
        const row = new ActionRowBuilder();
        
        if (!isClosed) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel(isClaimed ? 'Unclaim' : 'Claim')
                    .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setEmoji(isClaimed ? '🔓' : '🔑')
                    .setDisabled(isClaimed && claimer?.id !== message.author.id)
            );
            
            // Add priority buttons if not claimed or claimed by current user
            if (!isClaimed || (claimer && claimer.id === message.author.id)) {
                Object.entries(PRIORITY_MAP).forEach(([key, { emoji }]) => {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ticket_priority_${key}`)
                            .setLabel(key.charAt(0).toUpperCase() + key.slice(1))
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(emoji)
                            .setDisabled(key === priority)
                    );
                });
            }
        } else {
            // Ticket is closed, only show reopen button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_reopen')
                    .setLabel('Reopen')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔓')
            );
        }

        // Update the message
        return message.edit({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error updating ticket message:', error);
        throw error;
    }
}

/**
 * Gets the promo row for ticket messages
 * @returns {import('discord.js').ActionRowBuilder} The action row with promo button
 */
export function getPromoRow() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Need a bot like this?')
            .setURL('https://discord.gg/your-invite-link')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🤖')
    );
    
    return row;
}
