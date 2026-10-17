import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import type { ShopItem, ShopUserData } from './items.js';
import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export interface ShopCategory {
    id: string;
    name: string;
    description: string;
    icon: string;
    itemTypes: string[];
}

export const shopConfig = {
    name: 'Nexo Shop',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '💵',
    
    categories: [
        {
            id: 'consumables',
            name: 'Verbrauchsgüter',
            description: 'Einmal nutzbare Items mit zeitlich begrenzten Vorteilen',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: 'Upgrades',
            description: 'Dauerhafte Upgrades, die deine Fähigkeiten verbessern',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: 'Werkzeuge',
            description: 'Ausrüstung, mit der du Ressourcen effizienter sammelst',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: 'Rollen',
            description: 'Besondere Rollen mit einzigartigen Vorteilen',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
cooldown: 1000,
maxQuantity: 10,
confirmTimeout: 30000,
        
        refundPolicy: {
            enabled: true,
window: 300000,
fee: 0.1
        }
    },
    
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        colors: {
primary: '#5865F2',
success: '#43B581',
error: '#F04747',
warning: '#FAA61A',
info: '#00B0F4',
            
            rarity: {
common: '#99AAB5',
uncommon: '#2ECC71',
rare: '#3498DB',
epic: '#9B59B6',
legendary: '#F1C40F',
mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    events: {
        restock: {
            enabled: true,
interval: 86400000,
announcementChannel: null as string | null,
            message: '🛒 **Shop aufgefüllt!** Neue Items sind jetzt verfügbar!'
        },
        
        sales: {
            enabled: true,
            schedule: [
                {
day: 0,
discount: 0.2,
                    message: '🔥 **Wochenend-Sale!** 20 % Rabatt auf alle Items!'
                },
            ]
        }
    }
};

export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

export function getCurrentPrice(
    itemId: string,
    { quantity = 1, userData = null }: { quantity?: number; userData?: ShopUserData | null } = {},
): number {
    const basePrice = getItemPrice(itemId) * quantity;
    
    let discount = 0;
    
    const now = new Date();
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    if (userData) {
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        if (quantity >= 10) {
discount += 0.1;
        }
    }
    
    discount = Math.max(0, Math.min(1, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

export function getCategoryForItem(itemType: string): Omit<ShopCategory, 'itemTypes'> & { itemTypes?: string[] } {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: 'Sonstiges',
        description: 'Verschiedene Items',
        icon: '📦'
    };
}

export function getItemsInCategory(categoryId: string): ShopItem[] {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}