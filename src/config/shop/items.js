




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
    },

    // ─── GTA V RP: Drug Trade ────────────────────────────────────────────
    {
        id: 'weed_oz',
        name: '🌿 Weed (1oz)',
        price: 500,
        description: 'A baggie of LS Kush. Move it on the block. Boosts `/work` payout.',
        type: 'consumable',
        maxQuantity: 50,
        effect: { type: 'work_yield', multiplier: 1.3, uses: 1 }
    },
    {
        id: 'meth_g',
        name: '🧪 Meth (1g)',
        price: 1500,
        description: 'Sandy Shores special. Risky to move. Boosts `/crime` payout.',
        type: 'consumable',
        maxQuantity: 25,
        effect: { type: 'crime_yield', multiplier: 1.5, uses: 1 }
    },
    {
        id: 'coke_g',
        name: '❄️ Cocaine (1g)',
        price: 2500,
        description: 'Vinewood nose candy. High demand, high heat. Big `/crime` boost.',
        type: 'consumable',
        maxQuantity: 25,
        effect: { type: 'crime_yield', multiplier: 1.8, uses: 1 }
    },
    {
        id: 'burner_phone',
        name: '📱 Burner Phone',
        price: 1500,
        description: 'Untraceable. Reduces the chance of getting busted on `/crime`.',
        type: 'consumable',
        maxQuantity: 10,
        effect: { type: 'crime_safety', multiplier: 1.4, uses: 3 }
    },
    {
        id: 'drug_stash',
        name: '💼 Drug Kingpin Stash',
        price: 50000,
        description: 'A safehouse stash. Permanent +25% on all drug-related earnings.',
        type: 'upgrade',
        maxLevel: 3,
        effect: { type: 'work_yield', multiplier: 1.25 }
    },

    // ─── GTA V RP: Black Market Guns ────────────────────────────────────
    {
        id: 'bm_pistol',
        name: '🔫 Black Market Pistol',
        price: 3000,
        description: 'A cheap iron from the docks. Boosts `/rob` success.',
        type: 'tool',
        durability: 50,
        effect: { type: 'robbery_yield', multiplier: 1.4 }
    },
    {
        id: 'bm_smg',
        name: '🔫 Black Market SMG',
        price: 12000,
        description: 'Spray and pray. Big boost on `/crime` and `/rob`.',
        type: 'tool',
        durability: 75,
        effect: { type: 'robbery_yield', multiplier: 1.8 }
    },
    {
        id: 'bm_rifle',
        name: '💣 Black Market Assault Rifle',
        price: 35000,
        description: 'Heist-grade hardware. Max-tier robbery boost.',
        type: 'tool',
        durability: 100,
        effect: { type: 'robbery_yield', multiplier: 2.5 }
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




