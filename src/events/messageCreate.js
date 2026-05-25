import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleLeveling } from '../services/leveling.js'; // Giả định hàm này nằm ở đây theo logic của bạn

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // 1. XỬ LÝ PREFIX COMMAND (nh!)
        const PREFIX = "nh!";
        if (message.content.startsWith(PREFIX)) {
            // Bỏ qua nếu tin nhắn từ bot hoặc không có nội dung
            if (message.author.bot) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            // Thêm lệnh vào đây
            if (commandName === 'ping') {
                return message.reply('Pong! 🏓');
            }
            
            // Bạn có thể thêm lệnh khác ở đây nếu muốn (ví dụ lock/unlock)
            
            return; // Dừng lại ở đây, không cần chạy leveling cho lệnh prefix
        }

        // 2. XỬ LÝ LEVELING (Logic cũ của bạn)
        try {
            if (message.author.bot || !message.guild) return;
            await handleLeveling(message, client);
        } catch (error) {
            logger.error('Error in messageCreate:', error);
        }
    }
};
