import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../config/shop/items.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the economy shop with pagination'),

    async execute(interaction, config, client) {
        try {
            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, endIndex);

                const embed = new EmbedBuilder()
                    .setTitle("🛒 Store")
                    .setColor(getColor('primary'))
                    .setDescription('Use `/buy item_id:<id> quantity:<amount>` to purchase an item.');

                pageItems.forEach(item => {
                    embed.addFields({
                        name: `${item.name} (${item.id})`,
                        value: `🏷️ **Type:** ${item.type}\n💚 **Price:** $${item.price.toLocaleString()}\n${item.description}`,
                        inline: false,
                    });
                });

                embed.setFooter({ text: `Page ${page}/${totalPages}` });
                return embed;
            };

            const createShopComponents = (page) => {
                if (totalPages <= 1) {
                    return [];
                }

                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('Next ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages)
                    )
                ];
            };

            const message = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: createShopComponents(currentPage),
                flags: 0
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: '❌ You cannot use these buttons. Run `/shop` to get your own shop view.',
                        flags: 64
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();
                    if (customId === 'shop_prev' && currentPage > 1) {
                        currentPage--;
                    } else if (customId === 'shop_next' && currentPage < totalPages) {
                        currentPage++;
                    }
                    await buttonInteraction.editReply({
                        embeds: [createShopEmbed(currentPage)],
                        components: createShopComponents(currentPage)
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledComponents = createShopComponents(currentPage);
                    disabledComponents.forEach(row => {
                        row.components.forEach(button => button.setDisabled(true));
                    });

                    await message.edit({
                        components: disabledComponents
                    });
                } catch (error) {
                    
                }
            });
        } catch (error) {
            logger.error('Shop command error:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading the shop.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};




