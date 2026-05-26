import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
    name: 'help',
    async execute(interaction, client, args) {
        const action = args[0]; // 'next' hoặc 'back'
        const currentPage = parseInt(args[1]) || 1;
        const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;

        // 1. Lấy Embed mới (hàm này cần tồn tại trong project của bạn)
        // Bạn có thể copy logic từ lệnh /help gốc sang đây
        const newEmbed = await client.helpManager.getEmbed(newPage); 

        // 2. Tạo lại hàng nút bấm với số trang mới
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`help:back:${newPage - 1}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(newPage <= 1),
            new ButtonBuilder()
                .setCustomId(`help:next:${newPage + 1}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
        );

        // 3. Cập nhật tin nhắn
        await interaction.editReply({
            embeds: [newEmbed],
            components: [row]
        });
    }
};
