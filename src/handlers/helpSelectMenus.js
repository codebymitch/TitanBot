import { getCategoryEmbedAndPageCount, createHelpPaginationButtons } from '../utils/helpMenuHelper.js';
import { logger } from '../utils/logger.js';
import { MessageFlags } from 'discord.js';

export const helpCategorySelectMenu = {
    name: 'help-category-select',
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // 1. Lấy category mà người dùng chọn
            const selectedCategory = interaction.values[0];
            
            // Nếu chọn "All Commands" (ID: help-all-commands) thì xử lý riêng hoặc ignore
            if (selectedCategory === 'help-all-commands') {
                return await interaction.editReply({ 
                    content: 'Coming soon: All commands view! Please use the category view instead.' 
                });
            }

            // 2. Lấy Embed trang đầu tiên (page 1) của category đó
            const { embed, totalPages } = await getCategoryEmbedAndPageCount(selectedCategory, 1, client);
            
            // 3. Tạo nút bấm chuyển trang cho category này
            const row = createHelpPaginationButtons(1, totalPages, selectedCategory);
            
            // 4. Cập nhật tin nhắn
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            logger.error('Error in help category select menu handler:', error);
            
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while loading help categories.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    },
};
