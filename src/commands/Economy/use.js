import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ADMIN_POTION_ID = 'admin_potion';
const DEFAULT_LUCK_POTION_DURATION_MS = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use a consumable item from your inventory')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to use')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").toLowerCase();

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
        potionExpiries[itemId] = currentExpiry + duration;
        userData.luckPotionExpiresAt = potionExpiries;

        const remaining = held - 1;
        if (remaining > 0) {
            userData.inventory[itemId] = remaining;
        } else {
            delete userData.inventory[itemId];
        }

        await setEconomyData(client, guildId, userId, userData);

        const activeSeconds = Math.ceil((potionExpiries[itemId] - now) / 1000);
        let description = `You used **${item.name}**! It is now active for **${activeSeconds}s**.`;
        if (itemId === ADMIN_POTION_ID) {
            description += `\n\n👑 **Luck: 1000% / Kitsune: 10%**`;
        }

        const embed = successEmbed("✨ Item Used", description);

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'use' })
};
