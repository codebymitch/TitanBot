import { MessageFlags } from 'discord.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getItemById } from '../../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import { logger } from '../../../utils/logger.js';

const DEFAULT_LUCK_POTION_DURATION_MS = 5 * 60 * 1000;

const economyUseUndoHandler = {
    name: 'use_undo',

    async execute(interaction, client, args) {
        const [userId, itemId, amountRaw, expiresAtRaw] = args;
        const amount = Number(amountRaw);
        const expiresAt = Number(expiresAtRaw);

        const deferred = await safeDeferInteraction(interaction);
        if (!deferred) return;

        if (interaction.user.id !== userId) {
            await interaction.followUp({
                embeds: [warningEmbed('Not Your Undo', 'Only the person who used this item can undo it.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const item = getItemById(itemId);
        const validAmount = Number.isInteger(amount) && amount >= 1;

        if (!item || item.effect?.type !== 'fishing_luck' || !validAmount) {
            await interaction.editReply({
                embeds: [warningEmbed('Undo Unavailable', 'This use can no longer be undone.')],
                components: []
            });
            return;
        }

        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
            await interaction.editReply({
                embeds: [warningEmbed('Undo Window Closed', 'The time to undo this use has already passed.')],
                components: []
            });
            return;
        }

        const guildId = interaction.guildId;
        const userData = await getEconomyData(client, guildId, userId);

        const inventory = userData.inventory || {};
        inventory[itemId] = (Number(inventory[itemId]) || 0) + amount;
        userData.inventory = inventory;

        const now = Date.now();
        const durationPerUse = Number(item.effect?.duration) || DEFAULT_LUCK_POTION_DURATION_MS;
        const removedMs = durationPerUse * amount;
        const potionExpiries = userData.luckPotionExpiresAt || {};
        const currentExpiry = Number(potionExpiries[itemId]) || 0;
        const newExpiry = currentExpiry - removedMs;

        if (newExpiry > now) {
            potionExpiries[itemId] = newExpiry;
        } else {
            delete potionExpiries[itemId];
        }
        userData.luckPotionExpiresAt = potionExpiries;

        await setEconomyData(client, guildId, userId, userData);

        const removedSeconds = Math.max(0, Math.round(removedMs / 1000));
        const embed = successEmbed(
            '↩️ Use Undone',
            `Returned **${amount} × ${item.name}** to your inventory and removed **${removedSeconds}s** of its effect.`
        );

        await interaction.editReply({ embeds: [embed], components: [] });

        logger.info(`[ECONOMY] Use undone`, {
            userId,
            guildId,
            itemId,
            amount,
            removedSeconds
        });
    }
};

export default economyUseUndoHandler;
