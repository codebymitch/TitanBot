/**
 * Shop items configuration
 * Defines all items available in the shop with their properties
 */

export const shopItems = [
    {
        id: 'extra_work',
        name: 'Extra Work Shift',
        price: 5000,
        description: 'Allows 1 extra use of the `/work` command.',
        type: 'consumable',
        maxQuantity: 5,
cooldown: 86400000,
        effect: {
            type: 'command_boost',
            command: 'work',
            uses: 1
        }
    },
    {
        id: 'bank_upgrade_1',
        name: 'Bank Upgrade I',
        price: 15000,
        description: 'Increases bank capacity and allows more funds to be deposited.',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: 'Diamond Pickaxe',
        price: 50000,
        description: 'Increases yield from `/mine`',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: 'Premium Server Role',
        price: 15000,
        description: 'A special role granting a fancy color and a 10% daily bonus.',
        type: 'role',
roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'lucky_clover',
        name: 'Lucky Clover',
        price: 10000,
        description: 'Increases the chance of winning a higher payout on `/gamble` once.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 Fishing Rod',
        price: 5000,
        description: 'Used for fishing commands',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Pickaxe',
        price: 7500,
        description: 'Used for mining commands',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 Laptop',
        price: 15000,
        description: 'Increases work earnings',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🍀 Lucky Charm',
        price: 10000,
        description: 'Increases luck for gambling. Has 3 uses before being consumed.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 Bank Note',
        price: 25000,
        description: 'Increases bank capacity by 10,000. Can be purchased multiple times.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 Personal Safe',
        price: 30000,
        description: 'Protects your money from theft. Prevents others from robbing you.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

/**
 * Get a shop item by its ID
 * @param {string} itemId - The ID of the item to find
 * @returns {Object|undefined} The item object or undefined if not found
 */
export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

/**
 * Get all items of a specific type
 * @param {string} type - The type of items to retrieve
 * @returns {Array} Array of items matching the type
 */
export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

/**
 * Get the price of an item by its ID
 * @param {string} itemId - The ID of the item
 * @returns {number} The price of the item, or 0 if not found
 */
export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

/**
 * Validate if an item can be purchased
 * @param {string} itemId - The ID of the item to validate
 * @param {Object} userData - The user's data including inventory and stats
 * @returns {{valid: boolean, reason: string}} Validation result
 */
export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'Item not found' };
    }

    // Inventory is an object: { itemId: quantity }
    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `You can only have a maximum of ${item.maxQuantity} ${item.name}s` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        // Check if user already has max level of this upgrade
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `You've already purchased ${item.name}` 
            };
        }
    }

    if (item.type === 'tool') {
        // Check if user already has this tool (except for bank_note which is stackable)
        const currentQuantity = inventory[itemId] || 0;
        if (itemId !== 'bank_note' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `You already have a ${item.name}` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `You already have the ${item.name} role` 
            };
        }
    }

    return { valid: true };
}




