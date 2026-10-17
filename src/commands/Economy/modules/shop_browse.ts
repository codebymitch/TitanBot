import type { SubcommandModule } from '../../../types/index.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags, type InteractionReplyOptions } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page: number) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
                const embed = new EmbedBuilder()
                    .setTitle('Shop')
                    .setColor(getColor('primary'))
                    .setDescription('Nutze `/eco buy item_id:<id> quantity:<amount>`, um ein Item zu kaufen.');
                pageItems.forEach(item => {
                    embed.addFields({
                        name: `${item.name} (${item.id})`,
                        value: `**Typ:** ${item.type}\n **Preis:** $${item.price.toLocaleString()}\n${item.description}`,
                        inline: false,
                    });
                });
                embed.setFooter({ text: `Seite ${page}/${totalPages}` });
                return embed;
            };

            const createShopComponents = (page: number) => {
                if (totalPages <= 1) return [];
                return [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ Vorherige')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('Weiter ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages),
                    ),
                ];
            };

            const message = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: createShopComponents(currentPage),
                flags: 0 as InteractionReplyOptions['flags'],
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({ content: '❌ Du kannst diese Buttons nicht nutzen. Führe `/eco shop` aus, um deine eigene Shop-Ansicht zu öffnen.', flags: 64 });
                    return;
                }
                const { customId } = buttonInteraction;
                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();
                    if (customId === 'shop_prev' && currentPage > 1) currentPage--;
                    else if (customId === 'shop_next' && currentPage < totalPages) currentPage++;
                    await buttonInteraction.editReply({
                        embeds: [createShopEmbed(currentPage)],
                        components: createShopComponents(currentPage),
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledComponents = createShopComponents(currentPage);
                    disabledComponents.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
                    await message.edit({ components: disabledComponents });
                } catch (error) {
                    logger.debug('shop_browse: could not disable components on collector end', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'shop_browse' });
        }
    },
} satisfies SubcommandModule;
