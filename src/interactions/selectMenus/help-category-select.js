import { getCategoryEmbedAndPageCount, createHelpPaginationButtons } from '../../utils/helpMenuHelper.js';

export default {
    name: 'help-category-select',
    async execute(interaction, client, args) {
        try {
            // 1. Lấy category mà người dùng chọn
            const selectedCategory = interaction.values[0];
            
            // Nếu chọn "All Commands" (ID: help-all-commands) thì xử lý riêng hoặc ignore
            if (selectedCategory === 'help-all-commands') {
                return await interaction.editReply({ content: 'Coming soon: All commands view!' });
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
            console.error('Error in select menu handler:', error);
            await interaction.editReply({ content: '❌ Failed to load category.' });
        }
    }
};
