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
        .setDescription('Remove an item quantity from a member inventory')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Member whose inventory will be changed')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('item_id')
                .setDescription('Shop item ID, for example admin_potion or extra_work')
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Quantity to remove from inventory')
                .setRequired(true)
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
        const amount = interaction.options.getInteger('amount', true);
        const item = getItemById(itemId);

        if (!item || !['consumable', 'tool'].includes(item.type)) {
            throw createError(
                `Invalid inventory item: ${itemId}`,
                ErrorTypes.VALIDATION,
                `\`${itemId}\` is not an inventory consumable or tool.`
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
                return { reason: 'no_item', current: 0 };
            }
            if (inventory != null && (typeof inventory !== 'object' || Array.isArray(inventory))) {
                throw createError(
                    'Invalid stored inventory',
                    ErrorTypes.DATABASE,
                    'The target inventory data is invalid. No changes were made.'
                );
            }

            const current = inventory?.[itemId] === undefined ? 0 : Number(inventory[itemId]);
            if (!Number.isSafeInteger(current) || current < 0) {
                throw createError(
                    `Invalid quantity stored for ${itemId}`,
                    ErrorTypes.DATABASE,
                    'The stored item quantity is invalid. No changes were made.'
                );
            }
            if (current < amount) {
                return { reason: 'insufficient', current };
            }

            const updatedData = {
                ...storedData,
                inventory: { ...(inventory || {}) },
            };
            const remaining = current - amount;
            if (remaining > 0) {
                updatedData.inventory[itemId] = remaining;
            } else {
                delete updatedData.inventory[itemId];
            }

            const saved = await setEconomyData(client, guildId, targetUser.id, updatedData);
            if (!saved) {
                throw createError(
                    `Failed to remove ${itemId} from inventory`,
                    ErrorTypes.DATABASE,
                    'Could not save the inventory change. No success was recorded.'
                );
            }

            return { reason: 'success', current, remaining };
        });

        if (result.reason === 'no_item') {
            throw createError(
                `No inventory data for ${targetUser.id}`,
                ErrorTypes.VALIDATION,
                `${targetMember} does not have **${item.name}** in their inventory.`
            );
        }
        if (result.reason === 'insufficient') {
            throw createError(
                `Insufficient ${itemId} quantity for ${targetUser.id}`,
                ErrorTypes.VALIDATION,
                `${targetMember} has **${result.current} × ${item.name}**, but you requested **${amount}**.`
            );
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: `Removed **${amount} × ${item.name}** from ${targetMember}'s inventory. Any already-active potion effect is unchanged.`,
        });

        logger.info('[ECONOMY] Inventory item expired by authorized role', {
            guildId,
            executorId: interaction.user.id,
            targetUserId: targetUser.id,
            itemId,
            amount,
            remaining: result.remaining,
        });
    }, { command: 'expireitem' })
};
