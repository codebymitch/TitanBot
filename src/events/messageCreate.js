import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        const PREFIX = "nh!";
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // --- DANH SÁCH LỆNH CỦA BẠN Ở ĐÂY ---
        const commandsList = {
            'ping': (msg) => msg.reply('Pong! 🏓'),
            'info': (msg) => msg.reply('Bot Starlight Security đang online! 🚀'),
            'server': (msg) => msg.reply(`Server: ${msg.guild.name}`),
            'say': (msg, args) => {
                if (!args.length) return msg.reply('Bạn chưa nhập nội dung!');
                msg.channel.send(args.join(' '));
            }
            // Thêm lệnh mới thì chỉ cần phẩy rồi thêm dòng:
            // 'tên-lệnh': (msg, args) => { ...code... },
        };

        // --- XỬ LÝ LỆNH ---
        if (commandsList[commandName]) {
            try {
                await commandsList[commandName](message, args);
            } catch (error) {
                logger.error(`Lỗi ở lệnh ${commandName}:`, error);
                message.reply('Đã có lỗi xảy ra khi chạy lệnh này.');
            }
        }
    }
};
