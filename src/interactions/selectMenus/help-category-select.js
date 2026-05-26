import { getCategoryEmbedAndPageCount, getAllCommandsEmbedAndPageCount, createHelpPaginationButtons } from '../../utils/helpMenuHelper.js';

export default {
    name: 'help-category-select',
    async execute(interaction, client, args) {
        try {
            await interaction.deferUpdate(); // Quan trọng: Đánh dấu đã nhận tương tác
            
            const selectedCategory = interaction.values[0];
            let result;

            // Xử lý đúng cho All Commands
            if (selectedCategory === 'help-all-commands') {
                result = await getAllCommandsEmbedAndPageCount(1, client);
            } else {
                result = await getCategoryEmbedAndPageCount(selectedCategory, 1, client);
            }

            const { embed, totalPages } = result;
            const row = createHelpPaginationButtons(1, totalPages, selectedCategory);
            
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
