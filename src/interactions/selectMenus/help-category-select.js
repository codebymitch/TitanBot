import { getCategoryEmbedAndPageCount, getAllCommandsEmbedAndPageCount, createHelpPaginationButtons } from '../../utils/helpMenuHelper.js';

export default {
    name: 'help-category-select',
    async execute(interaction, client, args) {
        try {
            const selectedCategory = interaction.values[0];
            let embed, totalPages;

            // Xử lý khi chọn "All Commands"
            if (selectedCategory === 'help-all-commands') {
                const result = await getAllCommandsEmbedAndPageCount(1, client);
                embed = result.embed;
                totalPages = result.totalPages;
            } else {
                // Xử lý các category bình thường
                const result = await getCategoryEmbedAndPageCount(selectedCategory, 1, client);
                embed = result.embed;
                totalPages = result.totalPages;
            }
            
            // Tạo nút bấm chuyển trang
            const row = createHelpPaginationButtons(1, totalPages, selectedCategory);
            
            // Cập nhật tin nhắn
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
