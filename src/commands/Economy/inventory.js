import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your economy inventory'),

    async execute(interaction, config, client) {
const userId = interaction.user.id;
        const guildId = interaction.guildId;

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const inventory = userData.inventory || {};

            let inventoryDescription = "Your inventory is currently empty.";

            if (Object.keys(inventory).length > 0) {
                inventoryDescription = Object.entries(inventory)
                    .filter(
                        ([itemId, quantity]) =>
                            quantity > 0 && SHOP_ITEMS[itemId],
                    ) // Filter out 0 quantity and unknown items
                    .map(
                        ([itemId, quantity]) =>
                            `**${SHOP_ITEMS[itemId].name}:** ${quantity}x`,
                    )
                    .join("\n");
            }

            const embed = createEmbed({ title: `📦 ${interaction.user.username}'s Inventory`, description: inventoryDescription, }).setThumbnail(interaction.user.displayAvatarURL());

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Inventory command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not fetch inventory data.",
                    ),
                ],
            });
        }
    },
};

