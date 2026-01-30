import { SlashCommandBuilder } from 'discord.js';
import { shopItems } from "../../config/shop/items.js";
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { botConfig } from '../../config/bot.js';

// Migrated from: commands/Economy/shop.js
export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View items available for purchase.")
        .setDMPermission(false),
    
    // Prefix command data
    name: "shop",
    aliases: ["store", "market"],
    description: "View items available for purchase.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}shop`,
    cooldown: 3,

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const embed = createEmbed({ title: "🛒 Server Shop", description: "Use `/buy <item_id>` to purchase an item. Prices are listed in cash (💵 )." });

        for (const item of shopItems) {
            embed.addFields({
                name: `${item.name} (${item.id})`,
                value: `**Price:** $${item.price.toLocaleString()}\n**Type:** ${item.type}\n${item.description}`,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
