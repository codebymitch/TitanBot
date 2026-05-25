import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Cấu hình Prefix
        const PREFIX = "nh!";
        
        // Kiểm tra xem tin nhắn có đúng format không
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        // Tách lấy tên lệnh và tham số
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Xử lý các lệnh bằng switch case (Dễ thêm bớt lệnh)
        switch (commandName) {
            case 'ping':
                return message.reply('Pong! 🏓');

            case 'say':
                const text = args.join(' ');
                if (!text) return message.reply('Bạn phải nhập nội dung!');
                return message.channel.send(text);

            case 'info':
                return message.reply('Bot đang chạy mượt mà trên Railway! 🚀');

            case 'server':
                return message.reply(`Tên server: ${message.guild.name}`);

            default:
                // Nếu lệnh không tồn tại, bạn có thể gửi tin nhắn thông báo hoặc để im
                return;
        }
    }
};
