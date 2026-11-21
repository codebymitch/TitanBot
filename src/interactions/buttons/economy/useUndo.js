import { MessageFlags } from 'discord.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getItemById } from '../../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import { undoPotionUse } from '../../../utils/potionUndo.js';
import { logger } from '../../../utils/logger.js';

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
                embeds: [warningEmbed('Undo Window Closed', 'The quick undo window has passed. Ask an admin to run /undo instead.')],
                components: []
            });
            return;
        }

        const guildId = interaction.guildId;
        const userData = await getEconomyData(client, guildId, userId);
        const result = undoPotionUse(userData, itemId, amount, Date.now());

        if (!result.ok) {
            await interaction.editReply({
                embeds: [warningEmbed('Nothing to Undo', 'This use was already undone.')],
                components: []
            });
            return;
        }

        await setEconomyData(client, guildId, userId, userData);

        const removedSeconds = Math.max(0, Math.round(result.removedMs / 1000));
        const embed = successEmbed(
            '↩️ Use Undone',
            `Returned **${result.refunded} × ${item.name}** to your inventory and removed **${removedSeconds}s** of its effect.`
        );

        await interaction.editReply({ embeds: [embed], components: [] });

        logger.info(`[ECONOMY] Use undone via button`, {
            userId,
            guildId,
            itemId,
            amount: result.refunded,
            removedSeconds
        });
    }
};

export default economyUseUndoHandler;
