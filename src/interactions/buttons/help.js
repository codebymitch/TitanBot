import { getCategoryEmbedAndPageCount, createHelpPaginationButtons } from '../../utils/helpMenuHelper.js';

export default {
    name: 'help',
    async execute(interaction, client, args) {
        try {
            console.log('🔵 Help button handler triggered');
            console.log('Button customId:', interaction.customId);
            console.log('Args received:', args);

            // Parse arguments: action (next/back), page, category
            const action = args[0]; // 'next' hoặc 'back'
            const currentPage = parseInt(args[1]) || 1;
            const category = args[2] || ''; // Category name (nếu có)

            console.log(`Action: ${action}, Page: ${currentPage}, Category: ${category}`);

            if (!action || !category) {
                console.error('Missing action or category');
                await interaction.editReply({
                    content: '❌ Invalid button interaction. Please use the help command again.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Tính trang mới
            const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;
            console.log(`Moving from page ${currentPage} to page ${newPage}`);

            // Lấy Embed và số trang tối đa của category
            const { embed, totalPages } = await getCategoryEmbedAndPageCount(category, newPage, client);
            console.log(`Total pages: ${totalPages}, Current page: ${newPage}`);

            // Tạo lại hàng nút bấm với số trang mới
            const row = createHelpPaginationButtons(newPage, totalPages, category);

            // Cập nhật tin nhắn
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
            
            console.log('✅ Help pagination updated successfully');
        } catch (error) {
            console.error('❌ Error in help button handler:', error);
            await interaction.editReply({
                content: '❌ An error occurred while handling the help menu.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }
};
