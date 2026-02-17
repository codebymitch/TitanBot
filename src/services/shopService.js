import { EmbedBuilder } from 'discord.js';
import { shopConfig, shopItems, getItemById, validatePurchase, getCurrentPrice, getItemsInCategory } from '../config/shop/index.js';
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

/**
 * Shop service for handling shop-related operations
 */
class ShopService {
    constructor() {
        this.logger = logger.child({ module: 'ShopService' });
    }

    /**
     * Purchase an item from the shop
     * @param {string} userId - The ID of the user making the purchase
     * @param {string} itemId - The ID of the item to purchase
     * @param {number} [quantity=1] - The quantity to purchase
     * @param {Object} [options] - Additional options
     * @returns {Promise<{success: boolean, message: string, data?: any}>} The result of the purchase
     */
    async purchaseItem(userId, itemId, quantity = 1, options = {}) {
        try {
            const { guildId, client } = options;
            
            if (!client) {
                throw new Error('Client is required for shop operations');
            }
            
            const item = getItemById(itemId);
            if (!item) {
                return { success: false, message: 'Item not found in the shop.' };
            }

            const userData = await getEconomyData(client, guildId, userId);
            
            const totalCost = getCurrentPrice(itemId, { quantity, userData });
            
            if (userData.wallet < totalCost) {
                const currency = this.getCurrencyInfo();
                return { 
                    success: false, 
                    message: `You don't have enough ${currency.namePlural} to purchase this item.` 
                };
            }

            const validation = validatePurchase(itemId, userData);
            if (!validation.valid) {
                return { success: false, message: validation.reason };
            }

            // Deduct money from wallet
            userData.wallet -= totalCost;

            // Add item to inventory
            await this.addToUserInventory(userId, itemId, quantity, guildId, client, userData);

            // Save updated data
            await setEconomyData(client, guildId, userId, userData);

            this.logger.info(`User ${userId} purchased ${quantity}x ${item.name} for ${totalCost} ${this.getCurrencyName()}`);

            return {
                success: true,
                message: `Successfully purchased ${quantity}x ${item.name} for ${totalCost} ${this.getCurrencyName()}`,
                data: {
                    item,
                    quantity,
                    totalCost,
                    remainingBalance: userData.wallet
                }
            };
        } catch (error) {
            this.logger.error(`Error purchasing item: ${error.message}`, { error, userId, itemId, quantity });
            return { 
                success: false, 
                message: 'An error occurred while processing your purchase. Please try again later.' 
            };
        }
    }

    /**
     * Get the user's inventory
     * @param {string} userId - The ID of the user
     * @param {string} [guildId] - The ID of the guild (for server-specific items)
     * @param {Object} client - The Discord client
     * @returns {Promise<Object>} The user's inventory
     */
    async getUserInventory(userId, guildId, client) {
        try {
            const userData = await getEconomyData(client, guildId, userId);
            return userData.inventory || {};
        } catch (error) {
            this.logger.error(`Error getting user inventory: ${error.message}`, { error, userId, guildId });
            return {};
        }
    }

    /**
     * Add an item to the user's inventory
     * @private
     */
    async addToUserInventory(userId, itemId, quantity = 1, guildId = null, client = null, userData = null) {
        try {
            // Inventory is an object with itemId as key and quantity as value
            if (!userData) {
                userData = await getEconomyData(client, guildId, userId);
            }
            
            if (!userData.inventory) {
                userData.inventory = {};
            }
            
            const item = getItemById(itemId);
            
            // For upgrades, set to true (they're boolean flags)
            if (item && item.type === 'upgrade') {
                if (!userData.upgrades) {
                    userData.upgrades = {};
                }
                userData.upgrades[itemId] = true;
            } else {
                // For consumables and tools, add to inventory
                userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            }
            
            this.logger.info(`Added ${quantity}x ${itemId} to user ${userId}'s inventory`);
        } catch (error) {
            this.logger.error(`Error adding item to inventory: ${error.message}`, { error, userId, itemId, quantity, guildId });
            throw error;
        }
    }

    /**
     * Get the currency name
     * @returns {string} The name of the currency
     */
    getCurrencyName() {
        return shopConfig.currencyName || 'coins';
    }

    /**
     * Create an embed for the shop
     * @param {Object} options - Options for the shop embed
     * @param {string} [options.category] - The category to display
     * @param {number} [options.page=1] - The page number
     * @returns {EmbedBuilder} The shop embed
     */
    createShopEmbed(options = {}) {
        const { category, page = 1 } = options;
        
        const embed = new EmbedBuilder()
            .setTitle('🛒 TitanBot Shop')
            .setColor('#5865F2')
            .setDescription('Browse and purchase items from the shop. Use the buttons to navigate.')
            .setFooter({ text: `Page ${page}` });

        
        return embed;
    }

    /**
     * Get the shop categories
     * @returns {Array} The available shop categories
     */
    getCategories() {
        const categories = [
            { 
                id: 'all', 
                name: 'All Items', 
                emoji: '🛍️',
                description: 'Browse all available items',
                icon: '🛍️'
            },
            ...shopConfig.categories
        ];
        
        return categories;
    }
    
    /**
     * Get the currency information
     * @returns {Object} Currency information
     */
    getCurrencyInfo() {
        return {
            name: shopConfig.currencyName,
            namePlural: shopConfig.currencyNamePlural,
            symbol: shopConfig.currencySymbol
        };
    }
    
    /**
     * Get items for a specific category
     * @param {string} categoryId - The category ID
     * @returns {Array} Array of items in the category
     */
    getItemsForCategory(categoryId) {
        if (categoryId === 'all') {
            return shopItems;
        }
        return getItemsInCategory(categoryId);
    }
}

const shopService = new ShopService();
export default shopService;



