import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
// Giả định bạn có hàm handleLeveling ở đây, nếu không có hãy xóa dòng import này
import { handleLeveling } from '../services/leveling.js'; 

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // 1. XỬ LÝ PREFIX COMMAND (nh!)
        const PREFIX = "nh!";
        if (message.content.startsWith(PREFIX)) {
            if (message.author.bot) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            // Thêm lệnh tại đây
            if (commandName === 'ping') {
                return message.reply('Pong! 🏓');
            }
            
            // Bạn có thể thêm lệnh khác tương tự...
            return; 
        }

        // 2. XỬ LÝ LEVELING (Logic gốc của TitanBot)
        try {
            if (message.author.bot || !message.guild) return;
            await handleLeveling(message, client);
        } catch (error) {
            logger.error('Error in messageCreate:', error);
        }
    }
};
