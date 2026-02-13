import { EmbedBuilder } from 'discord.js';
import { shopConfig, getItemById, validatePurchase, getCurrentPrice, getItemsInCategory } from '../config/shop/index.js';
import { logger } from '../utils/logger.js';
import { getUserBalance, updateUserBalance } from './economyService.js';

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
            const { guildId } = options;
            
            const item = getItemById(itemId);
            if (!item) {
                return { success: false, message: 'Item not found in the shop.' };
            }

            const userBalance = await getUserBalance(userId, guildId);
            
            const totalCost = getCurrentPrice(itemId, { quantity, userData: userBalance });
            
            if (userBalance.balance < totalCost) {
                const currency = this.getCurrencyInfo();
                return { 
                    success: false, 
                    message: `You don't have enough ${currency.namePlural} to purchase this item.` 
                };
            }

            const validation = validatePurchase(itemId, userBalance);
            if (!validation.valid) {
                return { success: false, message: validation.reason };
            }

            await updateUserBalance(userId, -totalCost, 'shop_purchase', {
                itemId,
                itemName: item.name,
                quantity,
                unitPrice: totalCost / quantity
            });

            await this.addToUserInventory(userId, itemId, quantity, guildId);

            this.logger.info(`User ${userId} purchased ${quantity}x ${item.name} for ${totalCost} ${this.getCurrencyName()}`);

            return {
                success: true,
                message: `Successfully purchased ${quantity}x ${item.name} for ${totalCost} ${this.getCurrencyName()}`,
                data: {
                    item,
                    quantity,
                    totalCost,
                    remainingBalance: userBalance.balance - totalCost
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
     * @returns {Promise<Array>} The user's inventory
     */
    async getUserInventory(userId, guildId) {
        try {
return [];
        } catch (error) {
            this.logger.error(`Error getting user inventory: ${error.message}`, { error, userId, guildId });
            return [];
        }
    }

    /**
     * Add an item to the user's inventory
     * @private
     */
    async addToUserInventory(userId, itemId, quantity = 1, guildId = null) {
        try {
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
return 'coins';
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



