export const shopItems = [
    {
        id: 'extra_work',
        name: 'Extra Work Shift',
        price: 300000,
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
        price: 150000,
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
        price: 1500000,
        description: 'A special role granting a fancy color and a 10% fishing earnings bonus.',
        type: 'role',
roleId: null,
        effect: {
            type: 'fishing_yield',
            multiplier: 4
        }
    },
    {
        id: 'lucky_clover',
        name: 'Lucky Clover',
        price: 100000,
        description: 'Increases the chance of winning a higher payout on `/gamble` once.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    // ===== Fishing Rods (Tiers I - V) =====
    {
        id: 'fishing_rod_1',
        name: '🎣 Fishing Rod I',
        price: 5000,
        description: 'A basic fishing rod. Boosts fishing earnings by 10%.',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.1,
            tier: 1
        }
    },
    {
        id: 'fishing_rod_2',
        name: '🎣 Fishing Rod II',
        price: 25000,
        description: 'A sturdy fishing rod. Boosts fishing earnings by 25%.',
        type: 'tool',
        durability: 150,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.25,
            tier: 2
        }
    },
    {
        id: 'fishing_rod_3',
        name: '🎣 Fishing Rod III',
        price: 75000,
        description: 'A reinforced fishing rod. Boosts fishing earnings by 50%.',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.5,
            tier: 3
        }
    },
    {
        id: 'fishing_rod_4',
        name: '🎣 Fishing Rod IV',
        price: 200000,
        description: 'A premium fishing rod. Boosts fishing earnings by 75%.',
        type: 'tool',
        durability: 250,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.75,
            tier: 4
        }
    },
    {
        id: 'fishing_rod_5',
        name: '🎣 Fishing Rod V',
        price: 500000,
        description: 'A legendary fishing rod. Boosts fishing earnings by 100%.',
        type: 'tool',
        durability: 300,
        effect: {
            type: 'fishing_yield',
            multiplier: 2.0,
            tier: 5
        }
    },

    // ===== Luck Potions (Tiers I - V) =====
    {
        id: 'luck_potion_1',
        name: '🧪 Luck Potion I',
        price: 1000,
        description: 'Boosts your fishing luck slightly for 5 minutes. Higher chance of rarer fish.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'fishing_luck',
            multiplier: 1.15,
            duration: 300000
        }
    },
    {
        id: 'luck_potion_2',
        name: '🧪 Luck Potion II',
        price: 7000,
        description: 'Boosts your fishing luck for 5 minutes. Noticeably higher chance of rarer fish.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'fishing_luck',
            multiplier: 1.3,
            duration: 300000
        }
    },
    {
        id: 'luck_potion_3',
        name: '🧪 Luck Potion III',
        price: 50000,
        description: 'Boosts your fishing luck for 5 minutes. Good chance of rarer fish.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'fishing_luck',
            multiplier: 1.5,
            duration: 300000
        }
    },
    {
        id: 'luck_potion_4',
        name: '🧪 Luck Potion IV',
        price: 100000,
        description: 'Boosts your fishing luck for 5 minutes. Great chance of rarer fish.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'fishing_luck',
            multiplier: 1.8,
            duration: 300000
        }
    },
    {
        id: 'luck_potion_5',
        name: '🧪 Luck Potion V',
        price: 150000,
        description: 'Maximizes your fishing luck for 5 minutes. Best chance of legendary+ fish.',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'fishing_luck',
            multiplier: 2000000,
            duration: 300000
        }
    },

    // ===== Admin Potion (disimpan di inventory, dipakai dengan /use, bisa dikirim dengan /give) =====
    {
        id: 'admin_potion',
        name: '👑 Admin Potion',
        price: 100,
        description: 'Admin potion. Activate with `/use` for 5 minutes of great luck: Divine 30%, Transcendent 20%, Kitsune 10%. Can be gifted with `/give`.',
        type: 'consumable',
        effect: {
            type: 'fishing_luck',
            admin: true,
            chances: {
                divine: 0.3,
                transcendent: 0.2,
                celestial: 0.1
            },
            duration: 300000
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ Pickaxe',
        price: 75000,
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
        price: 500000,
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
        price: 100000,
        description: 'Increases luck for gambling. Has 3 uses before being consumed.',
        type: 'consumable',
        maxQuantity: 100,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 Bank Note',
        price: 250000,
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
        price: 300000,
        description: 'Protects your money from theft. Prevents others from robbing you.',
        type: 'tool',
        durability: null,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: 'Item not found' };
    }

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
        
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `You've already purchased ${item.name}` 
            };
        }
    }

    if (item.type === 'tool') {
        
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
