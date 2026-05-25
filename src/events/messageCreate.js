import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        const PREFIX = "nh!";
        // Check if message starts with prefix, is not a bot, and is in a guild
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // --- COMMAND LIST ---
        const commandsList = {
            'ping': (msg) => msg.reply('Pong! 🏓'),
            'info': (msg) => msg.reply('Bot Starlight Security is online! 🚀'),
            'server': (msg) => msg.reply(`Server name: ${msg.guild.name}`),
            'say': (msg, args) => {
                if (!args.length) return msg.reply('You haven\'t provided any content!');
                msg.channel.send(args.join(' '));
            }
            // Add new commands here:
            // 'command-name': (msg, args) => { ...code... },
        };

        // --- EXECUTION ---
        if (commandsList[commandName]) {
            try {
                await commandsList[commandName](message, args);
            } catch (error) {
                logger.error(`Error executing command ${commandName}:`, error);
                message.reply('An error occurred while executing this command.');
            }
        }
    }
};
