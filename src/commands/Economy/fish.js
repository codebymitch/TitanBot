import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import { getItemById } from '../../config/shop/items.js';

const FISH_COOLDOWN = 0; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;

// Helper: find the highest-tier fishing rod the user owns
function getBestFishingRod(inventory) {
    for (let tier = 5; tier >= 1; tier--) {
        const id = `fishing_rod_${tier}`;
        if ((inventory[id] || 0) > 0) {
            const item = getItemById(id);
            if (item) return item;
        }
    }
    return null;
}

// Helper: find the highest-tier luck potion the user owns
function getBestLuckPotion(inventory) {
    for (let tier = 5; tier >= 1; tier--) {
        const id = `luck_potion_${tier}`;
        if ((inventory[id] || 0) > 0) {
            const item = getItemById(id);
            if (item) return item;
        }
    }
    return null;
}

const FISH_TYPES = [
    // Common
    { name: 'Bass', emoji: '🐟', rarity: 'common' },
    { name: 'Salmon', emoji: '🐠', rarity: 'common' },
    { name: 'Trout', emoji: '🐟', rarity: 'common' },

    // Uncommon
    { name: 'Tuna', emoji: '🐡', rarity: 'uncommon' },
    { name: 'Swordfish', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Octopus', emoji: '🐙', rarity: 'uncommon' },

    // Rare
    { name: 'Lobster', emoji: '🦞', rarity: 'rare' },
    { name: 'Shark', emoji: '🦈', rarity: 'rare' },
    { name: 'Manta Ray', emoji: '🐟', rarity: 'rare' },

    // Epic
    { name: 'Golden Koi', emoji: '🐠', rarity: 'epic' },
    { name: 'Blue Marlin', emoji: '🐟', rarity: 'epic' },
    { name: 'Crystal Fish', emoji: '💎', rarity: 'epic' },

    // Legendary
    { name: 'Golden Shark', emoji: '🦈', rarity: 'legendary' },
    { name: 'Sea Dragon', emoji: '🐉', rarity: 'legendary' },
    { name: 'Golden Whale', emoji: '🐋', rarity: 'legendary' },

    // Mythic
    { name: 'Leviathan', emoji: '🐉', rarity: 'mythic' },
    { name: 'Megalodon', emoji: '🦈', rarity: 'mythic' },
    { name: 'Phoenix Koi', emoji: '🔥', rarity: 'mythic' },

    // Secret
    { name: 'Void Whale', emoji: '🌌', rarity: 'secret' },
    { name: 'Ancient Kraken', emoji: '🐙', rarity: 'secret' },
    { name: 'Abyss Serpent', emoji: '🐍', rarity: 'secret' },

    // Divine (Above Secret)
    { name: 'Cosmic Leviathan', emoji: '🌠', rarity: 'divine' },
    { name: 'God of Ocean', emoji: '🔱', rarity: 'divine' },
    { name: 'Eternal Whale', emoji: '🌌', rarity: 'divine' }
];

const CATCH_MESSAGES = [
    "You cast your line into the crystal clear waters...",
    "You wait patiently as your bobber floats...",
    "After a few minutes of waiting, you feel a tug...",
    "The water ripples as something takes your bait...",
    "You reel in your catch with expert precision...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Go fishing to catch fish and earn money'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const inventory = userData.inventory || {};

            const bestRod = getBestFishingRod(inventory);
            const bestPotion = getBestLuckPotion(inventory);

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `You're too tired to fish right now. Rest for **${hours}h ${minutes}m** before fishing again.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            let rand = Math.random();

            // Apply luck potion boost (shifts roll toward rarer fish)
            let luckMultiplier = 1;
            let luckMessage = "";
            if (bestPotion) {
                luckMultiplier = bestPotion.effect.multiplier || 1;
                rand = Math.min(rand * luckMultiplier, 0.9999);
                luckMessage = `\n🧪 **${bestPotion.name} Active: x${luckMultiplier} luck**`;
                // Consume one use of the potion
                inventory[bestPotion.id] = (inventory[bestPotion.id] || 0) - 1;
                if (inventory[bestPotion.id] <= 0) delete inventory[bestPotion.id];
            }

            let selectedRarity;

            if (rand < 0.45) {
                selectedRarity = 'common';
            } else if (rand < 0.70) {
                selectedRarity = 'uncommon';
            } else if (rand < 0.85) {
                selectedRarity = 'rare';
            } else if (rand < 0.94) {
                selectedRarity = 'epic';
            } else if (rand < 0.98) {
                selectedRarity = 'legendary';
            } else if (rand < 0.995) {
                selectedRarity = 'mythic';
            } else if (rand < 0.9995) {
                selectedRarity = 'secret';
            } else {
                selectedRarity = 'divine';
            }

            const availableFish = FISH_TYPES.filter(
                f => f.rarity === selectedRarity
            );
        
            const fishCaught = availableFish[
                Math.floor(Math.random() * availableFish.length)
            ];
            const fishPrices = {
                common: [300, 800],
                uncommon: [900, 1500],
                rare: [2000, 2500],
                epic: [3500, 6000],
                legendary: [7500, 15000],
                mythic: [30000, 50000],
                secret: [60000, 100000],
                divine: [125000, 350000]
            };

            const [minPrice, maxPrice] = fishPrices[fishCaught.rarity];

            const baseEarned = Math.floor(
                Math.random() * (maxPrice - minPrice + 1)
            ) + minPrice;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (bestRod) {
                const rodMultiplier = bestRod.effect.multiplier || 1;
                finalEarned = Math.floor(baseEarned * rodMultiplier);
                const boostPct = Math.round((rodMultiplier - 1) * 100);
                multiplierMessage = `\n🎣 **${bestRod.name} Bonus: +${boostPct}%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;
            userData.inventory = inventory;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F',
                mythic: '#E91E63',
                secret: '#FF0000',
                divine: '#00FFFF'
            };

            const embed = createEmbed({
                title: 'Fishing Success!',
                description: `${catchMessage}\n\nYou caught a **${fishCaught.emoji} ${fishCaught.name}**! You sold it for **$${finalEarned.toLocaleString()}**!${multiplierMessage}${luckMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "New Cash Balance",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Rarity",
                        value: fishCaught.rarity.charAt(0).toUpperCase() + fishCaught.rarity.slice(1),
                        inline: true,
                    }
                )
                

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
