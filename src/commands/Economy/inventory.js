import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const SHOP_ITEMS = shop.SHOP_ITEMS;

export default {
    data: new SlashCommandBuilder()
        .setName("inventory")
        .setDescription("View the items you own.")
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

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

            const embed = createEmbed(
                `📦 ${interaction.user.username}'s Inventory`,
                inventoryDescription,
            ).setThumbnail(interaction.user.displayAvatarURL());

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
