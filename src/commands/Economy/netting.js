import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getItemById } from '../../config/shop/items.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { pickFish, resolveActivePotions, rollRarityWithPotion, applyRarityUpgrade, rollExclusiveCatch, RARITY_COLORS, RARITY_ORDER, EXCLUSIVE_COLOR, EXCLUSIVE_CATCH_CHANCE } from './fish.js';
import { getActiveFishingLuckMultiplier } from '../../services/fishingEventService.js';

const PREMIUM_FISHING_MULTIPLIER = getItemById('premium_role')?.effect?.multiplier ?? 1.1;
const PREMIUM_PLUS_EFFECT = getItemById('premium_role_plus')?.effect ?? {};
const PREMIUM_PLUS_LUCK_MULTIPLIER = PREMIUM_PLUS_EFFECT.luckMultiplier ?? 1;
const PREMIUM_PLUS_INCOME_MULTIPLIER = PREMIUM_PLUS_EFFECT.incomeMultiplier ?? 1;
const PREMIUM_PLUS_RARITY_UP_CHANCE = PREMIUM_PLUS_EFFECT.rarityUpChance ?? 0;

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

            // Potion luck applies per fish, same rule as /fish.
            const now = Date.now();
            const { potionExpiries, bestPotion, adminPotion } =
                resolveActivePotions(inventory, userData, now);
            const activePotion = adminPotion || bestPotion;
            const adminChances = adminPotion?.effect?.chances || null;

            let luckMessage = "";
            if (activePotion) {
                const minutesLeft = Math.ceil(
                    (Number(potionExpiries[activePotion.id]) - now) / 60000
                );
                if (adminChances) {
                    const adminLuckMultiplier = activePotion.effect.multiplier || 1;
                    const kitsuneChance = Math.round((adminChances.celestial || 0) * 100);
                    luckMessage = `\n👑 **${activePotion.name} Active: ${Math.round(adminLuckMultiplier * 100)}% luck & Kitsune ${kitsuneChance}% (${minutesLeft}m left)**`;
                } else {
                    const luckMultiplier = activePotion.effect.multiplier || 1;
                    luckMessage = `\n🧪 **${activePotion.name} Active: x${luckMultiplier} luck (${minutesLeft}m left)**`;
                }
            }

            // Netting bonuses: net + premium roles only (Fishing Rod does NOT apply here).
            const guildConfig = await getGuildConfig(client, guildId);
            const premiumRoleId = guildConfig.premiumRoleId;
            const premiumPlusRoleId = guildConfig.premiumPlusRoleId;
            const hasPremiumRole = Boolean(
                premiumRoleId && interaction.member?.roles?.cache?.has(premiumRoleId)
            );
            const hasPremiumPlusRole = Boolean(
                premiumPlusRoleId && interaction.member?.roles?.cache?.has(premiumPlusRoleId)
            );
            const roleLuckMultiplier = hasPremiumPlusRole ? PREMIUM_PLUS_LUCK_MULTIPLIER : 1;

            // Event mancing global (lintas server) menambah luck untuk semua orang.
            const eventLuckMultiplier = await getActiveFishingLuckMultiplier();
            const totalLuckMultiplier = roleLuckMultiplier * eventLuckMultiplier;

            let fishingMultiplier = 1;
            const bonusMessages = [];
            if (eventLuckMultiplier > 1) {
                bonusMessages.push(`🌊 **Server Event Active: x${eventLuckMultiplier} luck**`);
            }

            const netMultiplier = Number(bestNet.effect?.multiplier) || 1;
            if (netMultiplier > 1) {
                fishingMultiplier *= netMultiplier;
                bonusMessages.push(`🕸️ **${bestNet.name} Bonus: +${Math.round((netMultiplier - 1) * 100)}%**`);
            }
            if (hasPremiumRole) {
                fishingMultiplier *= PREMIUM_FISHING_MULTIPLIER;
                bonusMessages.push(`✨ **Premium Role Bonus: +${Math.round((PREMIUM_FISHING_MULTIPLIER - 1) * 100)}%**`);
            }
            if (hasPremiumPlusRole) {
                fishingMultiplier *= PREMIUM_PLUS_INCOME_MULTIPLIER;
                const incomePct = Math.round((PREMIUM_PLUS_INCOME_MULTIPLIER - 1) * 100);
                const luckPct = Math.round((PREMIUM_PLUS_LUCK_MULTIPLIER - 1) * 100);
                const rarityUpPct = Math.round(PREMIUM_PLUS_RARITY_UP_CHANCE * 100);
                bonusMessages.push(`👑 **Premium Role+ Bonus: +${incomePct}% income, +${luckPct}% luck, ${rarityUpPct}% rarity-up**`);
            }

            // Tiap ikan di-roll rarity-nya sendiri secara acak (tergantung luck +
            // efek potion), jadi satu netting bisa berisi campuran rarity.
            let totalEarned = 0;
            let bestRarityIndex = -1;
            let bestCatch = null;
            const caughtLines = [];
            const collectionGains = {};

            for (let i = 0; i < catchCount; i++) {
                let rarity = rollRarityWithPotion(activePotion, totalLuckMultiplier);
                if (hasPremiumPlusRole) {
                    rarity = applyRarityUpgrade(rarity, PREMIUM_PLUS_RARITY_UP_CHANCE);
                }
                const { fish, baseEarned } = pickFish(rarity);
                const earned = Math.floor(baseEarned * fishingMultiplier);
                totalEarned += earned;
                const catchLine = `${fish.rarity} - ${fish.name} - $${earned.toLocaleString()}`;
                caughtLines.push(`• ${catchLine}`);
                collectionGains[fish.name] = (collectionGains[fish.name] || 0) + 1;

                const rarityIndex = RARITY_ORDER.indexOf(fish.rarity);
                if (!bestCatch || rarityIndex > bestCatch.rarityIndex ||
                    (rarityIndex === bestCatch.rarityIndex && earned > bestCatch.earned)) {
                    bestCatch = { line: catchLine, earned, rarityIndex };
                }

                if (rarityIndex > bestRarityIndex) bestRarityIndex = rarityIndex;
            }

            // Bonus eksklusif: pemilik Premium Role+ berpeluang mendapat satu
            // ikan eksklusif tambahan di jaring.
            let exclusiveFish = null;
            if (hasPremiumPlusRole && Math.random() < EXCLUSIVE_CATCH_CHANCE) {
                const roll = rollExclusiveCatch();
                const earned = Math.floor(roll.baseEarned * fishingMultiplier);
                exclusiveFish = { ...roll.fish, earned };
                totalEarned += earned;
                caughtLines.push(`• exclusive - ${roll.fish.name} - $${earned.toLocaleString()}`);
                collectionGains[roll.fish.name] = (collectionGains[roll.fish.name] || 0) + 1;
            }

            userData.wallet += totalEarned;
            userData.fishCollection = userData.fishCollection || {};
            for (const [name, count] of Object.entries(collectionGains)) {
                userData.fishCollection[name] = (Number(userData.fishCollection[name]) || 0) + count;
            }
            userData.inventory = inventory;
            userData.luckPotionExpiresAt = potionExpiries;

            await setEconomyData(client, guildId, userId, userData);

            const multiplierMessage = bonusMessages.length
                ? `\n\n${bonusMessages.join('\n')}`
                : "";
            const bestCatchMessage = bestCatch
                ? `\n\n**• highest net catch :**\n  **${bestCatch.line}**`
                : "";
            const exclusiveMessage = exclusiveFish
                ? `\n\n🌟 **EXCLUSIVE CATCH!** Your net also snagged a **${exclusiveFish.emoji} ${exclusiveFish.name}** worth **$${exclusiveFish.earned.toLocaleString()}**!`
                : "";
            const bestRarity = bestRarityIndex >= 0 ? RARITY_ORDER[bestRarityIndex] : null;

            const embed = createEmbed({
                title: '🕸️ Netting Success!',
                description: `You cast your **${bestNet.name}** and hauled in **${catchCount} fish**!\n\n${caughtLines.join('\n')}${bestCatchMessage}${exclusiveMessage}${multiplierMessage}${luckMessage}`,
                color: exclusiveFish ? EXCLUSIVE_COLOR : (bestRarity ? RARITY_COLORS[bestRarity] : 'primary')
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
