import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { COMMAND_MAP } from '../../config/aliases.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Configuration
        const PREFIX = "nh!";
        
        // Validation
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        // Parse command and arguments
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // 1. Resolve alias or use direct command name
        const realCommandName = COMMAND_MAP[commandName] || commandName;
        
        // 2. Try to find the command in the collection loaded by commandLoader
        const command = client.commands.get(realCommandName);

        if (command) {
            // 3. Create a "Fake Interaction" object to bridge Message to Interaction
            // This allows the existing code (designed for Slash) to run with Prefix
            const fakeInteraction = {
                member: message.member,
                guild: message.guild,
                channel: message.channel,
                user: message.author,
                // Mocking interaction methods
                reply: (content) => message.reply(content),
                editReply: (content) => message.channel.send(content), // Simplified
                deferReply: async () => {}, // No-op for prefix
                // Mocking options access
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
                logger.error(`Error executing ${realCommandName} via prefix:`, error);
                message.reply('An error occurred while executing this command.');
            }
            return;
        }

        // Optional: Keep your legacy "non-slash" commands here if needed
        // e.g., if you have hardcoded commands that aren't in the Command Loader
    }
};
