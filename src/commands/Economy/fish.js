import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 1500;
const BASE_MAX_REWARD = 4500;
const FISHING_ROD_MULTIPLIER = getItemById('fishing_rod')?.effect?.multiplier ?? 1.1;
const LUCK_POTION_IDS = [
    'luck_potion_5',
    'luck_potion_4',
    'luck_potion_3',
    'luck_potion_2',
    'luck_potion_1',
];
const LUCK_POTION_FISH_COOLDOWN = 30 * 1000;
const DEFAULT_LUCK_POTION_DURATION = 5 * 60 * 1000;

const FISH_TYPES = [
    { name: 'Bass', emoji: '🐟', rarity: 'common' },
    { name: 'Salmon', emoji: '🐟', rarity: 'common' },
    { name: 'Trout', emoji: '🐟', rarity: 'common' },
    { name: 'Tuna', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Swordfish', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Octopus', emoji: '🐙', rarity: 'rare' },
    { name: 'Lobster', emoji: '🦞', rarity: 'rare' },
    { name: 'Shark', emoji: '🦈', rarity: 'epic' },
    { name: 'Whale', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "You cast your line into the crystal clear waters...",
    "You wait patiently as your bobber floats...",
    "After a few minutes of waiting, you feel a tug...",
    "The water ripples as something takes your bait...",
    "You reel in your catch with expert precision...",
];

function getFishForLuckBonus(luckBonus = 0) {
    const roll = Math.random();
    const commonThreshold = 0.5 - luckBonus;
    const uncommonThreshold = 0.75 - (luckBonus * 0.6);
    const rareThreshold = 0.9 - (luckBonus * 0.3);
    const epicThreshold = 0.98 - (luckBonus * 0.1);

    let rarity = 'legendary';
    if (roll < commonThreshold) rarity = 'common';
    else if (roll < uncommonThreshold) rarity = 'uncommon';
    else if (roll < rareThreshold) rarity = 'rare';
    else if (roll < epicThreshold) rarity = 'epic';

    const fishOfRarity = FISH_TYPES.filter((fish) => fish.rarity === rarity);
    return fishOfRarity[Math.floor(Math.random() * fishOfRarity.length)];
}

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
            const hasFishingRod = userData.fishingRodOwned === true
                || Number(userData.inventory?.["fishing_rod"] || 0) > 0;
            const inventory = userData.inventory || {};
            const potionExpiries = { ...(userData.luckPotionExpiresAt || {}) };

            for (const potionId of LUCK_POTION_IDS) {
                const legacyQuantity = Number(inventory[potionId] || 0);
                if (Number(potionExpiries[potionId]) <= now && legacyQuantity > 0) {
                    const duration = Number(getItemById(potionId)?.effect?.duration)
                        || DEFAULT_LUCK_POTION_DURATION;
                    potionExpiries[potionId] = now + (duration * legacyQuantity);
                    inventory[potionId] = 0;
                }
            }

            userData.luckPotionExpiresAt = potionExpiries;
            const activePotionId = LUCK_POTION_IDS.find(
                (potionId) => Number(potionExpiries[potionId]) > now
            ) || null;
            const luckBonus = activePotionId
                ? Number(getItemById(activePotionId)?.effect?.fishingLuckBonus) || 0
                : 0;
            const fishCooldown = activePotionId ? LUCK_POTION_FISH_COOLDOWN : FISH_COOLDOWN;

            if (now < lastFish + fishCooldown) {
                const remaining = lastFish + fishCooldown - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );
                const seconds = Math.ceil((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `You're too tired to fish right now. Rest for **${hours}h ${minutes}m ${seconds}s** before fishing again.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const fishCaught = getFishForLuckBonus(luckBonus);

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Fishing Rod Bonus: +10%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];
            const luckMessage = activePotionId
                ? `\n🍀 **${getItemById(activePotionId).name} Active:** +${Math.round(luckBonus * 100)}% chance for higher-rarity fish.`
                : "";
            const nextFishingText = activePotionId ? "30 seconds while your potion is active." : "45 minutes.";

            userData.wallet += finalEarned;
            userData.lastFish = now;
            if (hasFishingRod) {
                userData.fishingRodOwned = true;
            }

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
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
                .setFooter({ text: `Next fishing trip available in ${nextFishingText}` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
