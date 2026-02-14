import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { MessageFlags } from 'discord.js';
import { getPromoRow } from '../../utils/components.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction, config, client) {
        return withErrorHandling(async () => {
            await interaction.deferReply();

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw createError(
                    `Item ${itemId} not found`,
                    ErrorTypes.VALIDATION,
                    `The item ID \`${itemId}\` does not exist in the shop.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw createError(
                    "Invalid quantity",
                    ErrorTypes.VALIDATION,
                    "You must purchase a quantity of 1 or more.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw createError(
                    "Insufficient funds",
                    ErrorTypes.VALIDATION,
                    `You need **$${totalCost.toLocaleString()}** to purchase ${quantity}x **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}** in cash.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    throw createError(
                        "Premium role not configured",
                        ErrorTypes.CONFIGURATION,
                        "The **Premium Shop Role** has not been configured by a server administrator yet.",
                        { itemId }
                    );
                }
                if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                    throw createError(
                        "Role already owned",
                        ErrorTypes.VALIDATION,
                        `You already have the **${item.name}** role.`,
                        { itemId, roleId: PREMIUM_ROLE_ID }
                    );
                }
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for role",
                        ErrorTypes.VALIDATION,
                        `You can only purchase the **${item.name}** role once.`,
                        { itemId, quantity }
                    );
                }
            }

            userData.wallet -= totalCost;

            let successDescription = `You successfully purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`;

            if (item.type === "role" && itemId === "premium_role") {
                const member = interaction.member;

                const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

                if (!role) {
                    throw createError(
                        "Role not found",
                        ErrorTypes.CONFIGURATION,
                        "The configured premium role no longer exists in this guild.",
                        { roleId: PREMIUM_ROLE_ID }
                    );
                }

                try {
                    await member.roles.add(
                        role,
                        `Purchased role: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 The role ${role.toString()} has been granted to you!**`;
                } catch (roleError) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw createError(
                        "Role assignment failed",
                        ErrorTypes.DISCORD_API,
                        "Successfully deducted money, but failed to grant the role. Your cash has been refunded.",
                        { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                successDescription += `\n\n**✨ Your upgrade is now active!**`;
            } else if (item.type === "consumable") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Purchase Successful",
                successDescription,
            ).addFields({
                name: "New Balance",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await interaction.editReply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }, { command: 'buy' });
    },
};





