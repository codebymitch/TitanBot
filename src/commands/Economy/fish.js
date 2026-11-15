import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getItemById } from '../../config/shop/items.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

const FISH_COOLDOWN = 0; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const DEFAULT_LUCK_POTION_DURATION_MS = 5 * 60 * 1000;
const PREMIUM_FISHING_MULTIPLIER = getItemById('premium_role')?.effect?.multiplier ?? 1.1;

// Helper: find the highest-tier fishing rod the user owns
function getBestFishingRod(inventory) {
    for (let tier = 5; tier >= 1; tier--) {
        const id = `fishing_rod_${tier}`;
        const legacyTierFiveQuantity = tier === 5
            ? Number(inventory.fishibg_rod_5 || 0)
            : 0;
        if (Number(inventory[id] || 0) > 0 || legacyTierFiveQuantity > 0) {
            const item = getItemById(id);
            if (item) return item;
        }
    }
    return null;
}

// Helper: find the highest-tier luck potion with an active timer
function getBestActiveLuckPotion(potionExpiries, now) {
    for (let tier = 5; tier >= 1; tier--) {
        const id = `luck_potion_${tier}`;
        if (Number(potionExpiries[id]) > now) {
            const item = getItemById(id);
            if (item) return item;
        }
    }
    return null;
}

export const FISH_TYPES = [
    // Common
    { name: 'Bass', emoji: '🐟', rarity: 'common' },
    { name: 'Salmon', emoji: '🐠', rarity: 'common' },
    { name: 'forel', emoji: '🐟', rarity: 'common' },
    { name: 'Carp', emoji: '🐟', rarity: 'common' },
    { name: 'Catfish', emoji: '🐟', rarity: 'common' },
    { name: 'Perch', emoji: '🐟', rarity: 'common' },
    { name: 'Sardine', emoji: '🐟', rarity: 'common' },
    { name: 'Mackerel', emoji: '🐟', rarity: 'common' },

    // Uncommon
    { name: 'Tuna', emoji: '🐡', rarity: 'uncommon' },
    { name: 'Swordfish', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Octopus', emoji: '🐙', rarity: 'uncommon' },
    { name: 'Barracuda', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Pufferfish', emoji: '🐡', rarity: 'uncommon' },
    { name: 'Snapper', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Mahi Mahi', emoji: '🐠', rarity: 'uncommon' },

    // Rare
    { name: 'Lobster', emoji: '🦞', rarity: 'rare' },
    { name: 'Shark', emoji: '🦈', rarity: 'rare' },
    { name: 'Manta Ray', emoji: '🐟', rarity: 'rare' },
    { name: 'Stingray', emoji: '🐟', rarity: 'rare' },
    { name: 'Anglerfish', emoji: '🐡', rarity: 'rare' },
    { name: 'Moray Eel', emoji: '🐍', rarity: 'rare' },
    { name: 'Hammerhead Shark', emoji: '🦈', rarity: 'rare' },

    // Epic
    { name: 'Golden Koi', emoji: '🐠', rarity: 'epic' },
    { name: 'Blue Marlin', emoji: '🐟', rarity: 'epic' },
    { name: 'Crystal Fish', emoji: '💎', rarity: 'epic' },
    { name: 'Moonfish', emoji: '🌙', rarity: 'epic' },
    { name: 'Electric Eel', emoji: '⚡', rarity: 'epic' },
    { name: 'Ruby Grouper', emoji: '🔴', rarity: 'epic' },
    { name: 'Sapphire Tuna', emoji: '🔵', rarity: 'epic' },

    // Legendary
    { name: 'Golden Shark', emoji: '🦈', rarity: 'legendary' },
    { name: 'Sea Dragon', emoji: '🐉', rarity: 'legendary' },
    { name: 'Golden Whale', emoji: '🐋', rarity: 'legendary' },
    { name: 'Storm Serpent', emoji: '🌩️', rarity: 'legendary' },
    { name: 'Aurora Whale', emoji: '🌌', rarity: 'legendary' },
    { name: 'Thunder Marlin', emoji: '⚡', rarity: 'legendary' },
    { name: 'Emerald Leviathan', emoji: '💚', rarity: 'legendary' },

    // Mythic
    { name: 'Leviathan', emoji: '🐉', rarity: 'mythic' },
    { name: 'Megalodon', emoji: '🦈', rarity: 'mythic' },
    { name: 'Phoenix Koi', emoji: '🔥', rarity: 'mythic' },
    { name: 'Celestial Turtle', emoji: '🐢', rarity: 'mythic' },
    { name: 'Abyssal Dragon', emoji: '🐉', rarity: 'mythic' },
    { name: 'Star Kraken', emoji: '🐙', rarity: 'mythic' },
    { name: 'Obsidian Whale', emoji: '🐋', rarity: 'mythic' },

    // Secret
    { name: 'Void Whale', emoji: '🌌', rarity: 'secret' },
    { name: 'Ancient Kraken', emoji: '🐙', rarity: 'secret' },
    { name: 'Abyss Serpent', emoji: '🐍', rarity: 'secret' },
    { name: 'Shadow Leviathan', emoji: '🌑', rarity: 'secret' },
    { name: 'Eclipse Ray', emoji: '🌘', rarity: 'secret' },
    { name: 'Genesis Eel', emoji: '⚡', rarity: 'secret' },
    { name: 'Nebula Shark', emoji: '🦈', rarity: 'secret' },

    // Divine (Above Secret)
    { name: 'Cosmic Leviathan', emoji: '🌠', rarity: 'divine' },
    { name: 'God of Ocean', emoji: '🔱', rarity: 'divine' },
    { name: 'Eternal Whale', emoji: '🌌', rarity: 'divine' },
    { name: 'Ocean Titan', emoji: '🌊', rarity: 'divine' },
    { name: 'Holy Megalodon', emoji: '✨', rarity: 'divine' },
    { name: 'Astral Dragon', emoji: '🐉', rarity: 'divine' },
    { name: 'Solar Koi', emoji: '☀️', rarity: 'divine' },

    // Transcendent (Above Divine)
    { name: 'Chronos Whale', emoji: '⏳', rarity: 'transcendent' },
    { name: 'Omnipotent Kraken', emoji: '👑', rarity: 'transcendent' },
    { name: 'Primordial Serpent', emoji: '🐍', rarity: 'transcendent' },
    { name: 'Infinity Koi', emoji: '♾️', rarity: 'transcendent' },
    { name: 'Genesis Leviathan', emoji: '🌟', rarity: 'transcendent' },
    { name: 'Celestia Dragon', emoji: '🐲', rarity: 'transcendent' },

    // Celestial (Above Transcendent) — Kitsune, peluang 2x lebih susah dari transcendent
    { name: 'Kitsune', emoji: '🦊', rarity: 'celestial' }
];

export const FISH_PRICES = {
    common: [200, 450],
    uncommon: [450, 750],
    rare: [1000, 1250],
    epic: [1750, 3000],
    legendary: [3750, 7500],
    mythic: [15000, 25000],
    secret: [30000, 50000],
    divine: [62500, 175000],
    transcendent: [250000, 500000],
    celestial: [10000000, 20000000]
};

export const RARITY_COLORS = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F1C40F',
    mythic: '#E91E63',
    secret: '#404850',
    divine: '#00FFFF',
    transcendent: '#FF00FF',
    celestial: '#FF69B4'
};

// Map a random roll (0-1) to a rarity using the standard catch distribution.
export function selectRarity(roll) {
    if (roll < 0.45) return 'common';
    if (roll < 0.70) return 'uncommon';
    if (roll < 0.85) return 'rare';
    if (roll < 0.94) return 'epic';
    if (roll < 0.98) return 'legendary';
    if (roll < 0.995) return 'mythic';
    if (roll < 0.9995) return 'secret';
    if (roll < 0.9997) return 'divine';
    if (roll < 0.9999) return 'transcendent';
    return 'celestial';
}

// Pick a random fish of a given rarity and roll its sale value.
export function pickFish(rarity) {
    const availableFish = FISH_TYPES.filter(f => f.rarity === rarity);
    const fish = availableFish[Math.floor(Math.random() * availableFish.length)];
    const [minPrice, maxPrice] = FISH_PRICES[rarity];
    const baseEarned = Math.floor(Math.random() * (maxPrice - minPrice + 1)) + minPrice;
    return { fish, baseEarned };
}

// Roll a fresh catch with the standard distribution (no potion/luck modifiers).
export function rollFishingCatch() {
    return pickFish(selectRarity(Math.random()));
}

// Resolve a user's active potion state: convert legacy inventory potions into
// running timers, then return the active luck potion (and admin potion if any).
export function resolveActivePotions(inventory, userData, now) {
    const potionExpiries = { ...(userData.luckPotionExpiresAt || {}) };
    for (let tier = 1; tier <= 5; tier++) {
        const potionId = `luck_potion_${tier}`;
        const legacyQuantity = Number(inventory[potionId] || 0);
        if (legacyQuantity > 0) {
            const currentExpiry = Math.max(now, Number(potionExpiries[potionId]) || 0);
            const duration = Number(getItemById(potionId)?.effect?.duration)
                || DEFAULT_LUCK_POTION_DURATION_MS;
            potionExpiries[potionId] = currentExpiry + (duration * legacyQuantity);
            delete inventory[potionId];
        }
    }

    const bestPotion = getBestActiveLuckPotion(potionExpiries, now);
    let adminPotion = null;
    for (const [potionId, expiry] of Object.entries(potionExpiries)) {
        if (Number(expiry) > now) {
            const potionItem = getItemById(potionId);
            if (potionItem?.effect?.admin) {
                adminPotion = potionItem;
                break;
            }
        }
    }

    return { potionExpiries, bestPotion, adminPotion };
}

// Roll a rarity from a random value biased by the given potion's luck.
// Admin potions also get a flat chance at the top tier (celestial/Kitsune).
export function rollRarityWithPotion(activePotion) {
    const adminChances = activePotion?.effect?.chances || null;
    if (adminChances && Math.random() < (adminChances.celestial || 0)) {
        return 'celestial';
    }

    let rand = Math.random();
    if (activePotion) {
        const luckMultiplier = activePotion.effect.multiplier || 1;
        rand = 1 - Math.pow(1 - rand, luckMultiplier);
        if (rand > 0.9998) rand = 0.9998;
    }
    return selectRarity(rand);
}

const CATCH_MESSAGES = [
    "Kamu melemparkan kailmu ke dalam air yang sangat jernih...",
    "Kamu menunggu dengan sabar saat pelampung pancingmu mengapung...",
    "Setelah beberapa menit menunggu, kamu merasakan tarikan pada kailmu...",
    "Air mulai beriak saat sesuatu memakan umpanmu...",
    "Kamu menarik hasil tangkapanmu dengan sangat ahli...",
    "Pelampungmu tenggelam! Sepertinya ada ikan yang menyambar...",
    "Air di sekitarmu mulai bergejolak...",
    "Tarikan semakin kuat, sepertinya ikan ini cukup besar...",
    "Kailmu bergerak liar, tangkapanmu berusaha melarikan diri...",
    "Setelah perjuangan panjang, akhirnya kamu berhasil mendapatkan ikan...",
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
            const { potionExpiries, bestPotion, adminPotion: activeAdminPotion } =
                resolveActivePotions(inventory, userData, now);
            userData.luckPotionExpiresAt = potionExpiries;

            const guildConfig = await getGuildConfig(client, guildId);
            const premiumRoleId = guildConfig.premiumRoleId;
            const hasPremiumRole = Boolean(
                premiumRoleId && interaction.member?.roles?.cache?.has(premiumRoleId)
            );

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

            const activePotion = activeAdminPotion || bestPotion;
            const adminChances = activeAdminPotion?.effect?.chances || null;

            let luckMessage = "";
            if (activePotion) {
                const minutesLeft = Math.ceil(
                    (Number(potionExpiries[activePotion.id]) - now) / 60000
                );
                if (adminChances) {
                    // Admin potion: luck sangat besar (mis. 1000% = x10) plus peluang Kitsune tetap.
                    const adminLuckMultiplier = activePotion.effect.multiplier || 1;
                    const kitsuneChance = Math.round((adminChances.celestial || 0) * 100);
                    luckMessage = `\n👑 **${activePotion.name} Active: ${Math.round(adminLuckMultiplier * 100)}% luck & Kitsune ${kitsuneChance}% (${minutesLeft}m left)**`;
                } else {
                    const luckMultiplier = activePotion.effect.multiplier || 1;
                    luckMessage = `\n🧪 **${activePotion.name} Active: x${luckMultiplier} luck (${minutesLeft}m left)**`;
                }
            }

            const selectedRarity = rollRarityWithPotion(activePotion);

            const { fish: fishCaught, baseEarned } = pickFish(selectedRarity);

            let fishingMultiplier = 1;
            const bonusMessages = [];
            if (bestRod) {
                const rodMultiplier = bestRod.effect.multiplier || 1;
                fishingMultiplier *= rodMultiplier;
                const boostPct = Math.round((rodMultiplier - 1) * 100);
                bonusMessages.push(`🎣 **${bestRod.name} Bonus: +${boostPct}%**`);
            }
            if (hasPremiumRole) {
                fishingMultiplier *= PREMIUM_FISHING_MULTIPLIER;
                const boostPct = Math.round((PREMIUM_FISHING_MULTIPLIER - 1) * 100);
                bonusMessages.push(`✨ **Premium Role Bonus: +${boostPct}%**`);
            }
            const finalEarned = Math.floor(baseEarned * fishingMultiplier);
            const multiplierMessage = bonusMessages.length
                ? `\n${bonusMessages.join('\n')}`
                : "";

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;
            userData.fishCollection = userData.fishCollection || {};
            userData.fishCollection[fishCaught.name] =
                (Number(userData.fishCollection[fishCaught.name]) || 0) + 1;
            userData.inventory = inventory;
            userData.luckPotionExpiresAt = potionExpiries;

            await setEconomyData(client, guildId, userId, userData);

            const embed = createEmbed({
                title: 'Fishing Success!',
                description: `${catchMessage}\n\nYou caught a **${fishCaught.emoji} ${fishCaught.name}**! You sold it for **$${finalEarned.toLocaleString()}**!${multiplierMessage}${luckMessage}`,
                color: RARITY_COLORS[fishCaught.rarity]
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
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
