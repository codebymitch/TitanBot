import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;
const ADMIN_POTION_ID = 'admin_potion';
// Potion ini langsung aktif saat dibeli. Admin potion TIDAK termasuk di sini:
// admin potion disimpan ke inventory dulu supaya bisa dipakai (/use) atau dikirim (/give).
const LUCK_POTION_IDS = new Set([
    'luck_potion_1',
    'luck_potion_2',
    'luck_potion_3',
    'luck_potion_4',
    'luck_potion_5',
]);
const DEFAULT_LUCK_POTION_DURATION_MS = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw createError(
                    `Item ${itemId} not found`,
                    ErrorTypes.VALIDATION,
                    `The item ID \`${itemId}\` does not exist in the shop.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw createError(
                    "Invalid quantity",
                    ErrorTypes.VALIDATION,
                    "You must purchase a quantity of 1 or more.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw createError(
                    "Insufficient funds",
                    ErrorTypes.VALIDATION,
                    `You need **$${totalCost.toLocaleString()}** to purchase ${quantity}x **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}** in cash.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    throw createError(
                        "Premium role not configured",
                        ErrorTypes.CONFIGURATION,
                        "The **Premium Shop Role** has not been configured by a server administrator yet.",
                        { itemId }
                    );
                }
                if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                    throw createError(
                        "Role already owned",
                        ErrorTypes.VALIDATION,
                        `You already have the **${item.name}** role.`,
                        { itemId, roleId: PREMIUM_ROLE_ID }
                    );
                }
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for role",
                        ErrorTypes.VALIDATION,
                        `You can only purchase the **${item.name}** role once.`,
                        { itemId, quantity }
                    );
                }
            }

            if (itemId === ADMIN_POTION_ID) {
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for admin potion",
                        ErrorTypes.VALIDATION,
                        `You can only purchase **${item.name}** one at a time.`,
                        { itemId, quantity }
                    );
                }
                const held = Number(userData.inventory?.[ADMIN_POTION_ID]) || 0;
                if (held >= 1) {
                    throw createError(
                        "Admin potion already held",
                        ErrorTypes.VALIDATION,
                        `You already hold an **${item.name}**. Use it with \`/use\` first.`,
                        { itemId }
                    );
                }
                const activeUntil = Number(userData.luckPotionExpiresAt?.[ADMIN_POTION_ID]) || 0;
                if (activeUntil > Date.now()) {
                    const secondsLeft = Math.ceil((activeUntil - Date.now()) / 1000);
                    throw createError(
                        "Admin potion on cooldown",
                        ErrorTypes.RATE_LIMIT,
                        `**${item.name}** is still active. You can buy it again in **${secondsLeft}s**.`,
                        { itemId, secondsLeft }
                    );
                }
            }

            userData.wallet -= totalCost;

            let successDescription = `You successfully purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`;

            if (item.type === "role" && itemId === "premium_role") {
                const member = interaction.member;

                const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

                if (!role) {
                    throw createError(
                        "Role not found",
                        ErrorTypes.CONFIGURATION,
                        "The configured premium role no longer exists in this guild.",
                        { roleId: PREMIUM_ROLE_ID }
                    );
                }

                try {
                    await member.roles.add(
                        role,
                        `Purchased role: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 The role ${role.toString()} has been granted to you!**`;
                } catch (roleError) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw createError(
                        "Role assignment failed",
                        ErrorTypes.DISCORD_API,
                        "Successfully deducted money, but failed to grant the role. Your cash has been refunded.",
                        { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                successDescription += `\n\n**✨ Your upgrade is now active!**`;
            } else if (item.type === "consumable" && LUCK_POTION_IDS.has(itemId)) {
                const now = Date.now();
                const potionExpiries = userData.luckPotionExpiresAt || {};
                const currentExpiry = Math.max(now, Number(potionExpiries[itemId]) || 0);
                const duration = Number(item.effect?.duration) || DEFAULT_LUCK_POTION_DURATION_MS;
                potionExpiries[itemId] = currentExpiry + (duration * quantity);
                userData.luckPotionExpiresAt = potionExpiries;
                const activeMinutes = Math.ceil((potionExpiries[itemId] - now) / 60000);
                successDescription += `\n\n🧪 **Active for ${activeMinutes} minutes. Timer started at purchase.**`;
            } else if (item.type === "consumable" || item.type === "tool") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
                if (item.type === "tool") {
                    successDescription += `\n\n**🛠️ ${item.name} added to your inventory!**`;
                } else if (itemId === ADMIN_POTION_ID) {
                    successDescription += `\n\n👑 **Added to your inventory!** Activate it with \`/use item_id:${ADMIN_POTION_ID}\` or gift it with \`/give\`.`;
                }
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Purchase Successful",
                successDescription,
            ).addFields({
                name: "New Balance",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};
