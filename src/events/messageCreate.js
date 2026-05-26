import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        const PREFIX = "nh!";

        // Ignore messages that don't start with prefix, are from bots, or are not in a guild
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        // Parse command name and arguments
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Directly look up the command in the client.commands collection
        // No aliases file needed; it matches the file name in your commands folder
        const command = client.commands.get(commandName);

        if (command) {
            // Create a fake interaction object to bridge Prefix to Slash Command logic
            const fakeInteraction = {
                member: message.member,
                guild: message.guild,
                channel: message.channel,
                user: message.author,
                reply: (content) => message.reply(content),
                // Bridging options to support command arguments
                options: {
                    getMember: (name) => message.mentions.members.first() || message.member,
                    getString: (name) => args.join(' '),
                    getUser: (name) => message.mentions.users.first(),
                    getChannel: (name) => message.mentions.channels.first()
                }
            };

            try {
                // Execute the command using the fake interaction
                await command.execute(fakeInteraction);
            } catch (error) {
                logger.error(`Error executing ${commandName} via prefix:`, error);
                message.reply('An error occurred while executing this command.');
            }
        }
    }
};
