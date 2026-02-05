import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { MessageFlags } from 'discord.js';
import { getPromoRow } from '../../utils/components.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';

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
const userId = interaction.user.id;
        const guildId = interaction.guildId;
        // Ensure the command ID is passed to lowercase for lookup
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = SHOP_ITEMS[itemId];

        // --- VALIDATION: Item Exists ---
        if (!item) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Item Not Found",
                        `The item ID \`${itemId}\` does not exist in the shop.`,
                    ),
                ],
                flags: [MessageFlags.Ephemeral],
            });
        }

        // --- VALIDATION: Quantity ---
        if (quantity < 1) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Invalid Quantity",
                        "You must purchase a quantity of 1 or more.",
                    ),
                ],
                flags: [MessageFlags.Ephemeral],
            });
        }

        const totalCost = item.price * quantity;

        // --- GET GUILD CONFIG & ROLE ID ---
        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;
        // ---------------------------------

        try {
            const userData = await getEconomyData(client, guildId, userId);

            // --- VALIDATION: Funds ---
            if (userData.wallet < totalCost) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Funds",
                            `You need **$${totalCost.toLocaleString()}** to purchase ${quantity}x **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}** in cash.`,
                        ),
                    ],
                    flags: [MessageFlags.Ephemeral],
                });
            }

            // --- VALIDATION: Role Purchase Checks ---
            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Configuration Missing",
                                "The **Premium Shop Role** has not been configured by a server administrator yet. The purchase cannot be completed.",
                            ),
                        ],
                        flags: [MessageFlags.Ephemeral],
                    });
                }
                if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Already Owned",
                                `You already have the **${item.name}** role.`,
                            ),
                        ],
                        flags: [MessageFlags.Ephemeral],
                    });
                }
                // Enforce single-quantity purchase for roles
                if (quantity > 1) {
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Invalid Quantity",
                                `You can only purchase the **${item.name}** role once.`,
                            ),
                        ],
                        flags: [MessageFlags.Ephemeral],
                    });
                }
            }

            // --- Transaction Logic ---
            userData.wallet -= totalCost;

            let successDescription = `You successfully purchased ${quantity}x **${item.name}** for **$${totalCost.toLocaleString()}**!`;

            // --- Inventory/Upgrade/Role Handling ---
            if (item.type === "role" && itemId === "premium_role") {
                // --- ROLE GRANTING LOGIC ---
                const member = interaction.member;

                try {
                    // Fetch the role object to ensure it exists before adding
                    const role =
                        interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

                    if (!role) {
                        throw new Error(
                            "Configured role ID does not match any role in this guild.",
                        );
                    }

                    await member.roles.add(
                        role, // Pass the role object, or ID is usually fine, but object is safer
                        `Purchased role: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 The role ${role.toString()} has been granted to you!**`;
                } catch (roleError) {
                    console.error(
                        `Failed to grant role ${PREMIUM_ROLE_ID}:`,
                        roleError,
                    );
                    // Refund cash if role granting failed
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Role Error",
                                `Successfully deducted money, but failed to grant the **${item.name}** role. Please check bot permissions and try again. Your cash has been refunded.`,
                            ),
                        ],
                        flags: [MessageFlags.Ephemeral],
                    });
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                successDescription += `\n\n**✨ Your upgrade is now active!**`;
            } else if (item.type === "consumable") {
                // Handle inventory: increment quantity or initialize
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
            }

            await setEconomyData(client, guildId, userId, userData);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "💰 Purchase Successful",
                        successDescription,
                    ).addFields({
                        name: "New Balance",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    }),
                ],
                flags: [MessageFlags.Ephemeral],
            });
        } catch (error) {
            console.error("Buy command execution error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An unexpected error occurred during the purchase process. Check the console for details.",
                    ),
                ],
                flags: [MessageFlags.Ephemeral],
            });
        }
    },
};

