import { EmbedBuilder } from 'discord.js';
import { shopConfig, shopItems, getItemById, validatePurchase, getCurrentPrice, getItemsInCategory } from '../config/shop/index.js';
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';




class ShopService {
    constructor() {
        this.logger = logger.child({ module: 'ShopService' });
    }

    







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

            
            userData.wallet -= totalCost;

            
            await this.addToUserInventory(userId, itemId, quantity, guildId, client, userData);

            
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

    






    async getUserInventory(userId, guildId, client) {
        try {
            const userData = await getEconomyData(client, guildId, userId);
            return userData.inventory || {};
        } catch (error) {
            this.logger.error(`Error getting user inventory: ${error.message}`, { error, userId, guildId });
            return {};
        }
    }

    



    async addToUserInventory(userId, itemId, quantity = 1, guildId = null, client = null, userData = null) {
        try {
            
            if (!userData) {
                userData = await getEconomyData(client, guildId, userId);
            }
            
            if (!userData.inventory) {
                userData.inventory = {};
            }
            
            const item = getItemById(itemId);
            
            
            if (item && item.type === 'upgrade') {
                if (!userData.upgrades) {
                    userData.upgrades = {};
                }
                userData.upgrades[itemId] = true;
            } else {
                
                userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            }
            
            this.logger.info(`Added ${quantity}x ${itemId} to user ${userId}'s inventory`);
        } catch (error) {
            this.logger.error(`Error adding item to inventory: ${error.message}`, { error, userId, itemId, quantity, guildId });
            throw error;
        }
    }

    



    getCurrencyName() {
        return shopConfig.currencyName || 'coins';
    }

    






    createShopEmbed(options = {}) {
        const { category, page = 1 } = options;
        
        const embed = new EmbedBuilder()
            .setTitle('🛒 TitanBot Shop')
            .setColor('#5865F2')
            .setDescription('Browse and purchase items from the shop. Use the buttons to navigate.')
            .setFooter({ text: `Page ${page}` });

        
        return embed;
    }

    



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
    
    



    getCurrencyInfo() {
        return {
            name: shopConfig.currencyName,
            namePlural: shopConfig.currencyNamePlural,
            symbol: shopConfig.currencySymbol
        };
    }
    
    




    getItemsForCategory(categoryId) {
        if (categoryId === 'all') {
            return shopItems;
        }
        return getItemsInCategory(categoryId);
    }
}

const shopService = new ShopService();
export default shopService;



