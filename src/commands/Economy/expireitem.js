import { SlashCommandBuilder } from 'discord.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyKey, setEconomyData } from '../../utils/economy.js';
import { createError, ErrorTypes, withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { Mutex } from '../../utils/mutex.js';
import { logger } from '../../utils/logger.js';

const AUTHORIZED_ROLE_ID = '1569773580185764026';

export default {
    data: new SlashCommandBuilder()
        .setName('expireitem')
        .setDescription('Expire an item from inventory or end an active potion effect')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Member whose item or potion effect will be expired')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('item_id')
                .setDescription('Shop item ID, for example admin_potion or extra_work')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('scope')
                .setDescription('Choose whether to expire inventory stock or active potion duration')
                .setRequired(true)
                .addChoices(
                    { name: 'Inventory', value: 'inventory' },
                    { name: 'Masa aktif potion', value: 'active_effect' },
                )
        )
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Inventory only; leave empty to remove all remaining stock')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000000)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        if (!interaction.guildId || !interaction.guild) {
            throw createError(
                'Expire item is guild-only',
                ErrorTypes.VALIDATION,
                'This command can only be used in a server.'
            );
        }

        if (!interaction.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID)) {
            throw createError(
                'Missing authorized role for expireitem',
                ErrorTypes.PERMISSION,
                'You do not have permission to use this command.'
            );
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const targetUser = interaction.options.getUser('user', true);
        const itemId = interaction.options.getString('item_id', true).trim().toLowerCase();
        const scope = interaction.options.getString('scope', true);
        const requestedAmount = interaction.options.getInteger('amount');
        const item = getItemById(itemId);

        if (!['inventory', 'active_effect'].includes(scope)) {
            throw createError(
                `Invalid expireitem scope: ${scope}`,
                ErrorTypes.VALIDATION,
                'Choose either `Inventory` or `Masa aktif potion`.'
            );
        }
        if (!item) {
            throw createError(
                `Unknown shop item: ${itemId}`,
                ErrorTypes.VALIDATION,
                `\`${itemId}\` is not a valid shop item ID.`
            );
        }
        if (scope === 'inventory' && !['consumable', 'tool'].includes(item.type)) {
            throw createError(
                `Invalid inventory item: ${itemId}`,
                ErrorTypes.VALIDATION,
                `\`${itemId}\` is not an inventory consumable or tool.`
            );
        }
        if (scope === 'active_effect' && item.effect?.type !== 'fishing_luck') {
            throw createError(
                `Item has no active potion effect: ${itemId}`,
                ErrorTypes.VALIDATION,
                `\`${itemId}\` does not have an expirable potion effect.`
            );
        }
        if (scope === 'active_effect' && requestedAmount != null) {
            throw createError(
                'Amount is not used for active effect expiry',
                ErrorTypes.VALIDATION,
                'Leave `amount` empty when expiring a potion effect.'
            );
        }

        if (targetUser.bot) {
            throw createError(
                'Cannot expire bot inventory',
                ErrorTypes.VALIDATION,
                'Choose a human member.'
            );
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            throw createError(
                'Target is not a guild member',
                ErrorTypes.VALIDATION,
                'The selected user is not a member of this server.'
            );
        }

        const result = await Mutex.runExclusive(`expire-item:${guildId}:${targetUser.id}`, async () => {
            if (!client?.db || typeof client.db.get !== 'function') {
                throw createError(
                    'Economy database unavailable',
                    ErrorTypes.DATABASE,
                    'Could not access the economy database. No inventory changes were made.'
                );
            }

            const key = getEconomyKey(guildId, targetUser.id);
            const storedData = await client.db.get(key, null);
            const inventory = storedData?.inventory;

            if (!storedData || typeof storedData !== 'object') {
                return { reason: scope === 'inventory' ? 'no_item' : 'no_effect', current: 0 };
            }
            if (inventory != null && (typeof inventory !== 'object' || Array.isArray(inventory))) {
                throw createError(
                    'Invalid stored inventory',
                    ErrorTypes.DATABASE,
                    'The target inventory data is invalid. No changes were made.'
                );
            }
            if (
                scope === 'active_effect' &&
                storedData.luckPotionExpiresAt != null &&
                (typeof storedData.luckPotionExpiresAt !== 'object' || Array.isArray(storedData.luckPotionExpiresAt))
            ) {
                throw createError(
                    'Invalid stored potion expiry data',
                    ErrorTypes.DATABASE,
                    'The target potion expiry data is invalid. No changes were made.'
                );
            }

            const updatedData = { ...storedData };
            let expiredAmount = 0;
            let remaining = null;
            let durationSeconds = 0;

            if (scope === 'inventory') {
                const current = inventory?.[itemId] === undefined ? 0 : Number(inventory[itemId]);
                if (!Number.isSafeInteger(current) || current < 0) {
                    throw createError(
                        `Invalid quantity stored for ${itemId}`,
                        ErrorTypes.DATABASE,
                        'The stored item quantity is invalid. No changes were made.'
                    );
                }
                if (current <= 0) return { reason: 'no_item', current };

                expiredAmount = requestedAmount ?? current;
                if (current < expiredAmount) return { reason: 'insufficient', current };

                remaining = current - expiredAmount;
                updatedData.inventory = { ...(inventory || {}) };
                if (remaining > 0) {
                    updatedData.inventory[itemId] = remaining;
                } else {
                    delete updatedData.inventory[itemId];
                }
            } else {
                const currentExpiry = Number(storedData.luckPotionExpiresAt?.[itemId]) || 0;
                const now = Date.now();
                if (currentExpiry <= now) return { reason: 'no_effect', current: 0 };

                durationSeconds = Math.ceil((currentExpiry - now) / 1000);
                updatedData.luckPotionExpiresAt = { ...(storedData.luckPotionExpiresAt || {}) };
                delete updatedData.luckPotionExpiresAt[itemId];
                updatedData.potionUseHistory = Array.isArray(storedData.potionUseHistory)
                    ? storedData.potionUseHistory.map((entry) =>
                        entry?.itemId === itemId ? { ...entry, remaining: 0 } : entry
                    )
                    : [];
            }

            const saved = await setEconomyData(client, guildId, targetUser.id, updatedData);
            if (!saved) {
                throw createError(
                    `Failed to remove ${itemId} from inventory`,
                    ErrorTypes.DATABASE,
                    'Could not save the change. No success was recorded.'
                );
            }

            return { reason: 'success', expiredAmount, remaining, durationSeconds };
        });

        if (result.reason === 'no_item') {
            throw createError(
                `No inventory data for ${targetUser.id}`,
                ErrorTypes.VALIDATION,
                `${targetMember} does not have **${item.name}** in their inventory.`
            );
        }
        if (result.reason === 'no_effect') {
            throw createError(
                `No active potion effect ${itemId} for ${targetUser.id}`,
                ErrorTypes.VALIDATION,
                `${targetMember} has no active **${item.name}** effect to expire.`
            );
        }
        if (result.reason === 'insufficient') {
            throw createError(
                `Insufficient ${itemId} quantity for ${targetUser.id}`,
                ErrorTypes.VALIDATION,
                `${targetMember} has **${result.current} × ${item.name}**, but you requested **${requestedAmount}**.`
            );
        }

        const successMessage = scope === 'inventory'
            ? `Removed **${result.expiredAmount} × ${item.name}** from ${targetMember}'s inventory. **${result.remaining}** remain.`
            : `Ended ${targetMember}'s active **${item.name}** effect (${result.durationSeconds}s remaining). Inventory was not changed, and this use can no longer be refunded with \`/undo\`.`;
        await InteractionHelper.safeEditReply(interaction, {
            content: successMessage,
        });

        logger.info('[ECONOMY] Inventory item or potion effect expired by authorized role', {
            guildId,
            executorId: interaction.user.id,
            targetUserId: targetUser.id,
            itemId,
            scope,
            amount: result.expiredAmount,
            durationSeconds: result.durationSeconds,
            remaining: result.remaining,
        });
    }, { command: 'expireitem' })
};
