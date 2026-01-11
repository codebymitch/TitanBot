/**
 * Shop Configuration Module
 * Centralized configuration for the shop system
 */

import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import { botConfig } from '../bot.js';

// Get currency settings from bot config
const { currency } = botConfig.economy;

// Shop configuration
export const shopConfig = {
    // General shop settings
    name: 'TitanBot Shop',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '💵',
    
    // Shop categories for organization
    categories: [
        {
            id: 'consumables',
            name: 'Consumables',
            description: 'One-time use items that provide temporary benefits',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: 'Upgrades',
            description: 'Permanent upgrades that enhance your abilities',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: 'Tools',
            description: 'Equipment that helps you gather resources more efficiently',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: 'Roles',
            description: 'Special roles with unique perks',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    // Transaction settings
    transaction: {
        cooldown: 1000, // 1 second between purchases to prevent spam
        maxQuantity: 10, // Maximum quantity that can be bought at once
        confirmTimeout: 30000, // 30 seconds to confirm a purchase
        
        // Refund policy (in milliseconds)
        refundPolicy: {
            enabled: true,
            window: 300000, // 5 minutes to request a refund
            fee: 0.1 // 10% restocking fee
        }
    },
    
    // Shop UI settings
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        // Colors for different UI elements
        colors: {
            primary: '#5865F2', // Discord blurple
            success: '#43B581', // Green
            error: '#F04747',   // Red
            warning: '#FAA61A', // Yellow
            info: '#00B0F4',    // Blue
            
            // Rarity colors
            rarity: {
                common: '#99AAB5',    // Gray
                uncommon: '#2ECC71',  // Green
                rare: '#3498DB',      // Blue
                epic: '#9B59B6',      // Purple
                legendary: '#F1C40F', // Gold
                mythic: '#E74C3C'     // Red
            }
        },
        
        // Emojis for different item types
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            // Item type emojis
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    // Shop events and announcements
    events: {
        restock: {
            enabled: true,
            interval: 86400000, // 24 hours
            announcementChannel: null, // Set to channel ID to enable announcements
            message: '🛒 **Shop Restocked!** New items are now available!'
        },
        
        sales: {
            enabled: true,
            schedule: [
                // Example: Weekend sale
                {
                    day: 0, // Sunday (0-6, where 0 is Sunday)
                    discount: 0.2, // 20% off
                    message: '🔥 **Weekend Sale!** 20% off all items!'
                },
                // Add more scheduled sales as needed
            ]
        }
    }
};

// Export all shop-related functions and configurations
export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

/**
 * Get the current price of an item, considering any active sales or discounts
 * @param {string} itemId - The ID of the item
 * @param {Object} [options] - Additional options
 * @param {number} [options.quantity=1] - The quantity being purchased
 * @param {Object} [options.userData] - The user's data for personalized pricing
 * @returns {number} The final price after applying discounts
 */
export function getCurrentPrice(itemId, { quantity = 1, userData = null } = {}) {
    const basePrice = getItemPrice(itemId) * quantity;
    
    // Apply any active discounts here (e.g., from sales, user perks, etc.)
    let discount = 0;
    
    // Example: Check for weekend sale (20% off on Sundays)
    const now = new Date();
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    // Apply user-specific discounts (e.g., from roles, perks, etc.)
    if (userData) {
        // Example: Premium role gives 10% off
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        // Example: Bulk discount for large quantities
        if (quantity >= 10) {
            discount += 0.1; // 10% off for bulk purchases of 10 or more
        }
    }
    
    // Ensure discount is between 0 and 1 (0% to 100%)
    discount = Math.max(0, Math.min(1, discount));
    
    // Calculate final price
    return Math.floor(basePrice * (1 - discount));
}

/**
 * Get the shop category for a specific item
 * @param {string} itemType - The type of the item
 * @returns {Object} The category object
 */
export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: 'Other',
        description: 'Miscellaneous items',
        icon: '📦'
    };
}

/**
 * Get all items in a specific category
 * @param {string} categoryId - The ID of the category
 * @returns {Array} Array of items in the category
 */
export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}
