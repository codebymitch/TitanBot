import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
// From src/commands/Economy/modules → up 3 levels to src/, then into config/shop/items.js
import { shopItems } from '../../../config/shop/items.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getPromoRow } from '../../../utils/components.js';

export default {

    async execute(interaction, config, client) {

        const ITEMS_PER_PAGE = 5;
        const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
        let currentPage = 1;

        const createShopEmbed = (page) => {
            const startIndex = (page - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const pageItems = shopItems.slice(startIndex, endIndex);

            const embed = createEmbed({ 
                title: "🛒 Server Shop", 
                description: `Use \`/buy <item_id>\` to purchase an item. Prices are listed in cash (💵).\n\n**Page ${page} of ${totalPages}**` 
            });

            pageItems.forEach(item => {
                embed.addFields({
                    name: `${item.name} (\`${item.id}\`)`,
                    value: `💰 **Price:** $${item.price.toLocaleString()}\n🏷️ **Type:** ${item.type}\n📝 ${item.description}`,
                    inline: false,
                });
            });

            embed.setFooter({
                text: `Total items: ${shopItems.length} | Use the buttons below to navigate`
            });

            return embed;
        };

        const createNavigationRow = (page) => {
            const row = new ActionRowBuilder();
            
            const prevButton = new ButtonBuilder()
                .setCustomId('prev_page')
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1);

            const nextButton = new ButtonBuilder()
                .setCustomId('next_page')
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages);

            const pageInfoButton = new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`Page ${page}/${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);

            row.addComponents(prevButton, pageInfoButton, nextButton);
            return row;
        };

        const message = await interaction.editReply({ 
            embeds: [createShopEmbed(currentPage)], 
            components: [createNavigationRow(currentPage)]
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000 // 60 seconds
        });

        collector.on('collect', async (buttonInteraction) => {
            await buttonInteraction.deferUpdate();

            if (buttonInteraction.user.id !== interaction.user.id) {
                await buttonInteraction.followUp({
                    content: 'You cannot use these buttons. Run `/shop` to get your own shop view.',
                    flags: ["Ephemeral"]
                });
                return;
            }

            const { customId } = buttonInteraction;

            if (customId === 'prev_page' && currentPage > 1) {
                currentPage--;
            } else if (customId === 'next_page' && currentPage < totalPages) {
                currentPage++;
            }

            await buttonInteraction.editReply({
                embeds: [createShopEmbed(currentPage)],
                components: [createNavigationRow(currentPage)]
            });
        });

        collector.on('end', async () => {
            const disabledRow = createNavigationRow(currentPage);
            disabledRow.components.forEach(button => button.setDisabled(true));
            
            try {
                await message.edit({
                    components: [disabledRow]
                });
            } catch (error) {
                // Message might have been deleted
            }
        });
    },
};
