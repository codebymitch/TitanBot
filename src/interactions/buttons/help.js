import { getCategoryEmbedAndPageCount, createHelpPaginationButtons } from '../../utils/helpMenuHelper.js';

export default {
    name: 'help',
    async execute(interaction, client, args) {
        try {
            // Parse arguments: action (next/back), page, category
            const action = args[0]; // 'next' hoặc 'back'
            const currentPage = parseInt(args[1]) || 1;
            const category = args[2] || ''; // Category name (nếu có)

            if (!action || !category) {
                await interaction.editReply({
                    content: '❌ Invalid button interaction. Please use the help command again.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Tính trang mới
            const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

            // Lấy Embed và số trang tối đa của category
            const { embed, totalPages } = await getCategoryEmbedAndPageCount(category, newPage, client);

            // Tạo lại hàng nút bấm với số trang mới
            const row = createHelpPaginationButtons(newPage, totalPages, category);

            // Cập nhật tin nhắn
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error in help button handler:', error);
            await interaction.editReply({
                content: '❌ An error occurred while handling the help menu.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }
};
