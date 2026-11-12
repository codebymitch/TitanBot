import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

function getShopItem(itemId) {
    return SHOP_ITEMS.find(item => item.id === itemId)
        || (itemId === 'fishibg_rod_5'
            ? SHOP_ITEMS.find(item => item.id === 'fishing_rod_5')
            : null);
}

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your economy inventory'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Inventory requested for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for inventory",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }

            const inventory = userData.inventory || {};
            const inventoryLines = Object.entries(inventory)
                .filter(([itemId, quantity]) => {
                    const item = getShopItem(itemId);
                    return Number(quantity) > 0 && item;
                })
                .map(([itemId, quantity]) => {
                    const item = getShopItem(itemId);
                    return `**${item.name}:** ${quantity}x`;
                });
            const potionLines = Object.entries(userData.luckPotionExpiresAt || {})
                .filter(([, expiresAt]) => Number(expiresAt) > Date.now())
                .map(([itemId, expiresAt]) => {
                    const item = getShopItem(itemId);
                    if (!item) return null;
                    const minutesLeft = Math.ceil((Number(expiresAt) - Date.now()) / 60000);
                    return `🧪 **${item.name}:** Active (${minutesLeft}m left)`;
                })
                .filter(Boolean);
            const inventoryDescription = [...inventoryLines, ...potionLines].join("\n")
                || "Your inventory is currently empty.";

            logger.info(`[ECONOMY] Inventory retrieved`, { 
                userId, 
                guildId,
                itemCount: Object.keys(inventory).length
            });

            const embed = createEmbed({ 
                title: `🎒 ${interaction.user.username}'s Inventory`, 
                description: inventoryDescription, 
            }).setThumbnail(interaction.user.displayAvatarURL());

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};
