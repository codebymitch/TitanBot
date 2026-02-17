import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } from 'discord.js';
import { shopItems } from '../../config/shop/items.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the economy shop with pagination'),

    async execute(interaction, config, client) {
        try {
            const ITEMS_PER_PAGE = 2;
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, endIndex);

                const embed = new EmbedBuilder()
                    .setTitle("🛒 Store")
                    .setColor(0x2b2d31)
                    .setDescription(`Click a button below to instantly buy an item, or use the \`/item buy\` command.\nFor more details before purchasing, use the \`/item info\` command.`);

                pageItems.forEach(item => {
                    embed.addFields({
                        name: `${item.name}`,
                        value: `🏷️ **Type:** ${item.type}\n${item.description}\n💚 **Price:** ${item.price}`,
                        inline: false,
                    });
                });

                embed.setFooter({ text: `Page ${page}/${totalPages}` });
                return embed;
            };

            const createShopComponents = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, endIndex);

                const components = [];

                pageItems.forEach((item, index) => {
                    const isLastItem = index === pageItems.length - 1;
                    const row = new ActionRowBuilder();

                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`shop_buy:${item.id}`)
                            .setLabel('Buy')
                            .setStyle(ButtonStyle.Primary)
                    );

                    if (isLastItem && totalPages > 1) {
                        row.addComponents(
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
                        );
                    }

                    components.push(row);
                });

                return components;
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
                    return;
                }

                if (customId.startsWith('shop_buy:')) {
                    const deferred = await InteractionHelper.safeDefer(buttonInteraction, { flags: 64 });
                    if (!deferred) return;

                    const itemId = customId.split(':')[1];
                    const item = shopItems.find(i => i.id === itemId);

                    if (!item) {
                        return await buttonInteraction.editReply({
                            content: '❌ Item not found.'
                        });
                    }

                    try {
                        const { getEconomyData, setEconomyData } = await import('../../utils/economy.js');
                        const { getGuildConfig } = await import('../../services/guildConfig.js');
                        const { successEmbed, errorEmbed } = await import('../../utils/embeds.js');

                        const userId = buttonInteraction.user.id;
                        const guildId = buttonInteraction.guildId;
                        const totalCost = item.price;

                        const userData = await getEconomyData(client, guildId, userId);

                        if (userData.wallet < totalCost) {
                            return await buttonInteraction.editReply({
                                embeds: [errorEmbed(
                                    'Insufficient Funds',
                                    `You need **$${totalCost.toLocaleString()}** but only have **$${userData.wallet.toLocaleString()}**`
                                )]
                            });
                        }

                        if (item.type === 'role' && itemId === 'premium_role') {
                            const guildConfig = await getGuildConfig(client, guildId);
                            const roleId = guildConfig.premiumRoleId;

                            if (!roleId) {
                                return await buttonInteraction.editReply({
                                    embeds: [errorEmbed('Error', 'Premium role not configured')]
                                });
                            }

                            if (buttonInteraction.member.roles.cache.has(roleId)) {
                                return await buttonInteraction.editReply({
                                    embeds: [errorEmbed('Already Own', `You already have this role`)]
                                });
                            }

                            await buttonInteraction.member.roles.add(roleId);
                        }

                        if (!userData.inventory) userData.inventory = {};
                        userData.inventory[itemId] = (userData.inventory[itemId] || 0) + 1;
                        userData.wallet -= totalCost;

                        await setEconomyData(client, guildId, userId, userData);

                        await buttonInteraction.editReply({
                            embeds: [successEmbed(
                                `✅ Purchased **${item.name}** for **$${totalCost.toLocaleString()}**\n\n**New Balance:** $${userData.wallet.toLocaleString()}`,
                                '🛒 Purchase Complete'
                            )]
                        });

                        console.log(`✅ User ${buttonInteraction.user.tag} purchased ${item.id} for $${totalCost}`);
                    } catch (error) {
                        console.error('Purchase error:', error);
                        await buttonInteraction.editReply({
                            embeds: [errorEmbed('Error', 'Failed to process purchase')]
                        });
                    }
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
                    // Message may have been deleted
                }
            });
        } catch (error) {
            console.error('Shop command error:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading the shop.',
                flags: 64
            });
        }
    },
};




