import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { shopItems } from "../../config/shop/items.js";
import { getEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

const SHOP_ITEMS = shopItems;

export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("inventory")
        .setDescription("View the items you own.")
        .setDMPermission(false),
    
    // Prefix command data
    name: "inventory",
    aliases: ["inv", "items", "backpack"],
    description: "View the items you own.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}inventory`,
    cooldown: 5,

    // Slash command execution
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

    // Prefix command execution
    async executeMessage(message, args, client) {
        const userId = message.author.id;
        const guildId = message.guild.id;

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const inventory = userData.inventory || {};

            const inventoryDescription = Object.entries(inventory)
                .filter(
                    ([itemId, quantity]) =>
                        quantity > 0 && SHOP_ITEMS[itemId],
                ) // Filter out 0 quantity and unknown items
                .map(
                    ([itemId, quantity]) =>
                        `**${SHOP_ITEMS[itemId].name}:** ${quantity}x`,
                )
                .join("\n");

            const embed = createEmbed({ 
                title: `📦 ${message.author.username}'s Inventory`, 
                description: inventoryDescription || "Your inventory is empty.", 
            }).setThumbnail(message.author.displayAvatarURL());

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Inventory command error:", error);
            await message.reply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not fetch inventory data.",
                    ),
                ],
            });
        }
    }
};
