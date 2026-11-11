import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getItemById } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give an item from your inventory to another user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to give the item to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to give (e.g. admin_potion)')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to give (default: 1)')
                .setRequired(false)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser("user");
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;
        const guildId = interaction.guildId;

        if (receiver.bot) {
            throw createError(
                "Cannot give to bot",
                ErrorTypes.VALIDATION,
                "You cannot give an item to a bot.",
                { receiverId: receiver.id }
            );
        }

        if (receiver.id === senderId) {
            throw createError(
                "Cannot give to self",
                ErrorTypes.VALIDATION,
                "You cannot give an item to yourself.",
                { senderId }
            );
        }

        const item = getItemById(itemId);
        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `The item ID \`${itemId}\` does not exist.`,
                { itemId }
            );
        }

        const [senderData, receiverData] = await Promise.all([
            getEconomyData(client, guildId, senderId),
            getEconomyData(client, guildId, receiver.id)
        ]);

        const senderHeld = Number(senderData.inventory?.[itemId]) || 0;
        if (senderHeld < quantity) {
            throw createError(
                "Not enough items",
                ErrorTypes.VALIDATION,
                `You only have **${senderHeld}x ${item.name}** in your inventory.`,
                { itemId, senderHeld, quantity }
            );
        }

        // Batasi kepemilikan penerima seperti aturan pembelian.
        const receiverHeld = Number(receiverData.inventory?.[itemId]) || 0;
        if (item.type === 'tool' && itemId !== 'bank_note' && receiverHeld > 0) {
            throw createError(
                "Receiver already owns item",
                ErrorTypes.VALIDATION,
                `**${receiver.username}** already owns a **${item.name}**.`,
                { itemId, receiverId: receiver.id }
            );
        }
        if (item.type === 'consumable' && item.maxQuantity && receiverHeld + quantity > item.maxQuantity) {
            throw createError(
                "Receiver inventory limit",
                ErrorTypes.VALIDATION,
                `**${receiver.username}** can only hold a maximum of **${item.maxQuantity}x ${item.name}**.`,
                { itemId, receiverId: receiver.id, receiverHeld, quantity, maxQuantity: item.maxQuantity }
            );
        }

        if (senderHeld - quantity > 0) {
            senderData.inventory[itemId] = senderHeld - quantity;
        } else {
            delete senderData.inventory[itemId];
        }

        receiverData.inventory[itemId] = receiverHeld + quantity;

        await Promise.all([
            setEconomyData(client, guildId, senderId, senderData),
            setEconomyData(client, guildId, receiver.id, receiverData)
        ]);

        const embed = successEmbed(
            "🎁 Item Gifted",
            `You gave **${quantity}x ${item.name}** to **${receiver.username}**!`
        ).addFields(
            {
                name: "Item",
                value: `${item.name} x${quantity}`,
                inline: true,
            },
            {
                name: "Remaining",
                value: `${Number(senderData.inventory[itemId]) || 0}x`,
                inline: true,
            },
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`[ECONOMY] Item gifted`, {
            senderId,
            receiverId: receiver.id,
            itemId,
            quantity,
        });

        try {
            const receiverEmbed = createEmbed({
                title: "🎁 You received an item!",
                description: `${interaction.user.username} gave you **${quantity}x ${item.name}**.`
            });
            await receiver.send({ embeds: [receiverEmbed] });
        } catch (e) {
            logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
        }
    }, { command: 'give' })
};
