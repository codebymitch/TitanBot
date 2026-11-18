import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { recordPotionUse, DEFAULT_LUCK_POTION_DURATION_MS } from '../../utils/potionUndo.js';

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use a consumable item from your inventory')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to use')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of items to use at once (optional, defaults to 1)')
                .setRequired(false)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const requestedAmount = interaction.options.getInteger("amount") || 1;

        const item = getItemById(itemId);
        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `The item ID \`${itemId}\` does not exist.`,
                { itemId }
            );
        }

        const userData = await getEconomyData(client, guildId, userId);
        const held = Number(userData.inventory?.[itemId]) || 0;

        if (held <= 0) {
            throw createError(
                "Item not in inventory",
                ErrorTypes.VALIDATION,
                `You don't have **${item.name}** in your inventory.`,
                { itemId }
            );
        }

        if (requestedAmount > held) {
            throw createError(
                "Not enough items",
                ErrorTypes.VALIDATION,
                `You only have **${held}** × **${item.name}**. You can't use ${requestedAmount}.`,
                { itemId, requestedAmount, held }
            );
        }

        if (item.effect?.type !== 'fishing_luck') {
            throw createError(
                "Item not usable",
                ErrorTypes.VALIDATION,
                `**${item.name}** cannot be used right now.`,
                { itemId }
            );
        }

        const now = Date.now();
        const potionExpiries = userData.luckPotionExpiresAt || {};

        const duration = Number(item.effect?.duration) || DEFAULT_LUCK_POTION_DURATION_MS;
        const currentExpiry = Math.max(now, Number(potionExpiries[itemId]) || 0);
        potionExpiries[itemId] = currentExpiry + (duration * requestedAmount);
        userData.luckPotionExpiresAt = potionExpiries;

        const remaining = held - requestedAmount;
        if (remaining > 0) {
            userData.inventory[itemId] = remaining;
        } else {
            delete userData.inventory[itemId];
        }

        recordPotionUse(userData, itemId, requestedAmount, now);

        await setEconomyData(client, guildId, userId, userData);

        const activeSeconds = Math.ceil((potionExpiries[itemId] - now) / 1000);
        const expiryTimestamp = Math.floor(potionExpiries[itemId] / 1000);
        const usedText = requestedAmount > 1
            ? `You used **${requestedAmount} × ${item.name}**!`
            : `You used **${item.name}**!`;
        let description = `${usedText} It is now active for **${activeSeconds}s** and expires <t:${expiryTimestamp}:F> (<t:${expiryTimestamp}:R>).\n\n*Used too many by mistake? Press the button below within ` +
            `${Math.round(UNDO_WINDOW_MS / 60000)} minutes to return them.*`;
        if (item.effect?.admin) {
            const parts = [];
            if (item.effect.multiplier) {
                parts.push(`Luck: ${Math.round(item.effect.multiplier * 100)}%`);
            }
            if (item.effect.incomeMultiplier) {
                parts.push(`Income: ${Math.round(item.effect.incomeMultiplier * 100)}%`);
            }
            if (item.effect.chances?.celestial) {
                parts.push(`Kitsune: ${Math.round(item.effect.chances.celestial * 100)}%`);
            }
            if (parts.length) {
                description += `\n\n👑 **${parts.join(' / ')}**`;
            }
        }

        const embed = successEmbed("✨ Item Used", description);

        const undoExpiresAt = now + UNDO_WINDOW_MS;
        const undoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`use_undo:${userId}:${itemId}:${requestedAmount}:${undoExpiresAt}`)
                .setLabel('Undo Use')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [undoRow],
            flags: [MessageFlags.Ephemeral]
        });
    }, { command: 'use' })
};
