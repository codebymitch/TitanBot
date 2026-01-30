import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import botConfig from '../config/bot.js';
import { getGuildGiveaways as getGuildGiveawaysDb, saveGiveaway as saveGiveawayDb, deleteGiveaway as deleteGiveawayDb, unwrapReplitData } from './database.js';

/**
 * Generate a consistent key for giveaways in the database
 * @param {string} guildId - The guild ID
 * @returns {string} The formatted key
 */
export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

/**
 * Get all giveaways for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} Object mapping message IDs to giveaway data
 */
export async function getGuildGiveaways(client, guildId) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await client.db.get(key, {});
        const unwrappedGiveaways = unwrapReplitData(giveaways);
        return unwrappedGiveaways || {};
    } catch (error) {
        console.error(`Error getting giveaways for guild ${guildId}:`, error);
        return {};
    }
}

/**
 * Save a giveaway
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} giveawayData - The giveaway data to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        giveaways[giveawayData.messageId] = giveawayData;
        await client.db.set(key, giveaways);
        return true;
    } catch (error) {
        console.error(`Error saving giveaway in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Delete a giveaway
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID of the giveaway to delete
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function deleteGiveaway(client, guildId, messageId) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        if (!giveaways[messageId]) {
            return false;
        }
        
        delete giveaways[messageId];
        await client.db.set(key, giveaways);
        return true;
    } catch (error) {
        console.error(`Error deleting giveaway ${messageId} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Create an embed for a giveaway
 * @param {Object} giveaway - The giveaway data
 * @param {string} status - The status of the giveaway ('active' or 'ended')
 * @param {Array<string>} [winners=[]] - Array of winner user IDs
 * @returns {EmbedBuilder} The formatted embed
 */
export function createGiveawayEmbed(giveaway, status, winners = []) {
    const isEnded = status === 'ended';
    const participants = giveaway.participants || [];
    
    const embed = new EmbedBuilder()
        .setTitle(`🎉 ${giveaway.prize}`)
        .setDescription(giveaway.description || 'Enter this amazing giveaway!')
        .setColor(isEnded ? botConfig.embeds.colors.error : botConfig.embeds.colors.success)
        .addFields(
            { name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
            { name: 'Winners', value: `${giveaway.winnerCount}`, inline: true },
            { name: 'Entries', value: `${participants.length}`, inline: true }
        );

    if (isEnded) {
        embed.addFields(
            { name: 'Winners', value: winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'No winners' }
        );
    } else {
        // Use Discord's timestamp format for local time display
        const endTime = giveaway.endsAt || giveaway.endTime;
        embed.addFields(
            { name: 'Ends at', value: `<t:${Math.floor(endTime / 1000)}:R>` }
        );
    }

    return embed;
}

/**
 * Check if a giveaway has ended
 * @param {Object} giveaway - The giveaway data
 * @returns {boolean} Whether the giveaway has ended
 */
export function isGiveawayEnded(giveaway) {
    const endTime = giveaway.endsAt || giveaway.endTime;
    return Date.now() > endTime;
}

/**
 * Pick random winners from the entrants
 * @param {Array<string>} entrants - Array of user IDs
 * @param {number} count - Number of winners to pick
 * @returns {Array<string>} Array of winner user IDs
 */
export function pickWinners(entrants, count) {
    if (!entrants || entrants.length === 0) return [];
    
    const shuffled = [...entrants].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Create an embed for a giveaway (alias for createGiveawayEmbed)
 * @param {Object} giveaway - The giveaway data
 * @param {string} status - The status of the giveaway ('active', 'ended', 'reroll')
 * @param {Array<string>} [winners=[]] - Array of winner user IDs
 * @returns {EmbedBuilder} The formatted embed
 */
export function giveawayEmbed(giveaway, status, winners = []) {
    return createGiveawayEmbed(giveaway, status, winners);
}

/**
 * Create action row with giveaway buttons
 * @param {boolean} ended - Whether the giveaway has ended
 * @returns {ActionRowBuilder} The action row with buttons
 */
export function giveawayButtons(ended) {
    if (ended) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('giveaway_reroll')
                .setLabel('🎲 Reroll')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId('giveaway_end')
                .setLabel('✅ Ended')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
        );
    } else {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('giveaway_join')
                .setLabel('🎉 Join')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('giveaway_end')
                .setLabel('🛑 End')
                .setStyle(ButtonStyle.Danger)
        );
    }
}
