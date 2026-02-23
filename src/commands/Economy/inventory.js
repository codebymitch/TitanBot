import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

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

            let inventoryDescription = "Your inventory is currently empty.";

            if (Object.keys(inventory).length > 0) {
                inventoryDescription = Object.entries(inventory)
                    .filter(
                        ([itemId, quantity]) => {
                            const item = SHOP_ITEMS.find(i => i.id === itemId);
                            return quantity > 0 && item;
                        }
                    )
                    .map(
                        ([itemId, quantity]) => {
                            const item = SHOP_ITEMS.find(i => i.id === itemId);
                            return `**${item.name}:** ${quantity}x`;
                        }
                    )
                    .join("\n");
            }

            logger.info(`[ECONOMY] Inventory retrieved`, { 
                userId, 
                guildId,
                itemCount: Object.keys(inventory).length
            });

            const embed = createEmbed({ 
                title: `📦 ${interaction.user.username}'s Inventory`, 
                description: inventoryDescription, 
            }).setThumbnail(interaction.user.displayAvatarURL());

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};




