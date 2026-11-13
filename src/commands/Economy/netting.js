import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getItemById } from '../../config/shop/items.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { rollFishingCatch, RARITY_COLORS } from './fish.js';

const PREMIUM_FISHING_MULTIPLIER = getItemById('premium_role')?.effect?.multiplier ?? 1.1;

const RARITY_ORDER = [
    'common', 'uncommon', 'rare', 'epic', 'legendary',
    'mythic', 'secret', 'divine', 'transcendent', 'celestial'
];

// Highest-tier net the user owns (falls back to any net found).
function getBestFishingNet(inventory) {
    for (let tier = 5; tier >= 1; tier--) {
        const id = `fishing_net_${tier}`;
        if (Number(inventory[id] || 0) > 0) {
            const item = getItemById(id);
            if (item) return item;
        }
    }
    return null;
}

// Highest-tier rod the user owns, used for the fishing earnings bonus.
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

export default {
    data: new SlashCommandBuilder()
        .setName('netting')
        .setDescription('Cast your fishing net to catch several fish at once'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const userData = await getEconomyData(client, guildId, userId);
            const inventory = userData.inventory || {};

            const bestNet = getBestFishingNet(inventory);
            if (!bestNet) {
                throw createError(
                    "No fishing net owned",
                    ErrorTypes.VALIDATION,
                    "You don't own a **Fishing Net** yet. Buy one from the shop first with `/buy item_id:fishing_net_1`, then use this command.",
                    { userId, guildId }
                );
            }

            const catchCount = Number(bestNet.effect?.catches) || 5;

            // Same earnings bonuses as /fish (best rod + premium role).
            const bestRod = getBestFishingRod(inventory);
            const guildConfig = await getGuildConfig(client, guildId);
            const premiumRoleId = guildConfig.premiumRoleId;
            const hasPremiumRole = Boolean(
                premiumRoleId && interaction.member?.roles?.cache?.has(premiumRoleId)
            );

            let fishingMultiplier = 1;
            const bonusMessages = [];
            if (bestRod) {
                const rodMultiplier = bestRod.effect.multiplier || 1;
                fishingMultiplier *= rodMultiplier;
                bonusMessages.push(`🎣 **${bestRod.name} Bonus: +${Math.round((rodMultiplier - 1) * 100)}%**`);
            }
            if (hasPremiumRole) {
                fishingMultiplier *= PREMIUM_FISHING_MULTIPLIER;
                bonusMessages.push(`✨ **Premium Role Bonus: +${Math.round((PREMIUM_FISHING_MULTIPLIER - 1) * 100)}%**`);
            }

            let totalEarned = 0;
            let bestRarityIndex = -1;
            const caughtLines = [];
            const collectionGains = {};

            for (let i = 0; i < catchCount; i++) {
                const { fish, baseEarned } = rollFishingCatch();
                const earned = Math.floor(baseEarned * fishingMultiplier);
                totalEarned += earned;
                caughtLines.push(`• ${fish.name} — $${earned.toLocaleString()}`);
                collectionGains[fish.name] = (collectionGains[fish.name] || 0) + 1;

                const rarityIndex = RARITY_ORDER.indexOf(fish.rarity);
                if (rarityIndex > bestRarityIndex) bestRarityIndex = rarityIndex;
            }

            userData.wallet += totalEarned;
            userData.fishCollection = userData.fishCollection || {};
            for (const [name, count] of Object.entries(collectionGains)) {
                userData.fishCollection[name] = (Number(userData.fishCollection[name]) || 0) + count;
            }
            userData.inventory = inventory;

            await setEconomyData(client, guildId, userId, userData);

            const multiplierMessage = bonusMessages.length
                ? `\n\n${bonusMessages.join('\n')}`
                : "";
            const bestRarity = bestRarityIndex >= 0 ? RARITY_ORDER[bestRarityIndex] : null;

            const embed = createEmbed({
                title: '🕸️ Netting Success!',
                description: `You cast your **${bestNet.name}** and hauled in **${catchCount} fish**!\n\n${caughtLines.join('\n')}${multiplierMessage}`,
                color: bestRarity ? RARITY_COLORS[bestRarity] : 'primary'
            })
                .addFields(
                    {
                        name: "Total Earned",
                        value: `$${totalEarned.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "New Cash Balance",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    }
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'netting' })
};
