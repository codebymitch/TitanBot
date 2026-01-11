import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Economy/shop.js
export default {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("View items available for purchase.")
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const embed = createEmbed(
            "🛒 Server Shop",
            "Use `/buy <item_id>` to purchase an item. Prices are listed in cash (💵).",
        );

        for (const item of shopItemsList) {
            embed.addFields({
                name: `${item.name} (${item.key})`,
                value: `**Price:** $${item.price.toLocaleString()}\n**Type:** ${item.type}\n${item.description}`,
                inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
