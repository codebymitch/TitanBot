import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { undoPotionUse, getUndoableAmount } from '../../utils/potionUndo.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('undo')
        .setDescription('Refund potions that were accidentally used too many (admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the potion to refund (e.g. luck_potion_1)')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('How many to refund (optional, defaults to 1)')
                .setRequired(false)
                .setMinValue(1)
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Member whose use to undo (optional, defaults to yourself)')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const itemId = interaction.options.getString('item_id').toLowerCase();
        const amount = interaction.options.getInteger('amount') || 1;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        const item = getItemById(itemId);
        if (!item || item.effect?.type !== 'fishing_luck') {
            throw createError(
                `Item ${itemId} is not undoable`,
                ErrorTypes.VALIDATION,
                `\`${itemId}\` is not a potion that can be undone.`,
                { itemId }
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);
        const undoable = getUndoableAmount(userData, itemId);

        if (undoable <= 0) {
            throw createError(
                `Nothing to undo for ${itemId}`,
                ErrorTypes.VALIDATION,
                `${targetUser} has no recorded **${item.name}** use that can be refunded (or it is older than 3 days).`,
                { itemId, targetUserId: targetUser.id }
            );
        }

        const result = undoPotionUse(userData, itemId, amount, Date.now());
        if (!result.ok) {
            throw createError(
                `Failed to undo ${itemId}`,
                ErrorTypes.VALIDATION,
                `${targetUser} has no recorded **${item.name}** use that can be refunded.`,
                { itemId, targetUserId: targetUser.id }
            );
        }

        await setEconomyData(client, guildId, targetUser.id, userData);

        const removedSeconds = Math.max(0, Math.round(result.removedMs / 1000));
        const targetText = targetUser.id === interaction.user.id ? 'your inventory' : `${targetUser}'s inventory`;
        const embed = successEmbed(
            '↩️ Use Undone',
            `Returned **${result.refunded} × ${item.name}** to ${targetText} and removed **${removedSeconds}s** of its effect.` +
            (amount > result.refunded ? `\n\n*Only ${result.refunded} could be refunded (${undoable} were recorded).*` : '')
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });

        logger.info(`[ECONOMY] Use undone via command`, {
            guildId,
            itemId,
            amount: result.refunded,
            removedSeconds,
            executorId: interaction.user.id,
            targetUserId: targetUser.id
        });
    }, { command: 'undo' })
};
