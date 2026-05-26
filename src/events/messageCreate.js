import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        const PREFIX = "nh!";
        if (!message.content.startsWith(PREFIX) || message.author.bot || !message.guild) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        if (!commandName) return;

        const command = client.commands.get(commandName);
        if (!command) return;

        // Build a fakeInteraction that mimics a real Discord interaction closely enough
        // so that InteractionHelper and all commands work correctly for prefix commands.
        let _deferred = false;
        let _replied = false;

        const stripFlags = (options) => {
            if (!options || typeof options !== 'object') return options;
            const { flags, ephemeral, ...safe } = options;
            return safe;
        };

        const fakeInteraction = {
            // Marker so commands can detect prefix mode via: interaction._isPrefix === true
            _isPrefix: true,

            // InteractionHelper.isInteractionValid() requires id to be a string
            id: `prefix-${message.id}`,
            createdTimestamp: message.createdTimestamp,

            guildId: message.guild.id,
            commandName: commandName,

            member: message.member,
            guild: message.guild,
            channel: message.channel,
            user: message.author,
            client: client,

            get deferred() { return _deferred; },
            get replied() { return _replied; },

            deferReply: async () => {
                _deferred = true;
            },
            reply: async (content) => {
                const opts = stripFlags(typeof content === 'string' ? { content } : content);
                const msg = await message.reply(opts);
                _replied = true;
                return msg;
            },
            editReply: async (content) => {
                const opts = stripFlags(typeof content === 'string' ? { content } : content);
                const msg = await message.channel.send(opts);
                _replied = true;
                return msg;
            },
            followUp: async (content) => {
                const opts = stripFlags(typeof content === 'string' ? { content } : content);
                return message.channel.send(opts);
            },
            deleteReply: async () => {},

            options: {
                // For subcommand commands: first arg is the subcommand name
                getSubcommand: () => args[0] || null,

                // For named options: find first integer among args
                getInteger: (_name) => {
                    const num = args.find(a => /^-?\d+$/.test(a));
                    return num !== undefined ? parseInt(num, 10) : null;
                },
                getNumber: (_name) => {
                    const num = args.find(a => /^-?[\d.]+$/.test(a));
                    return num !== undefined ? parseFloat(num) : null;
                },
                // getString returns args joined (excluding subcommand if present)
                // Works for both plain "nh!ban @user reason" and subcommand "nh!todo add task"
                getString: (_name) => args.join(' ') || null,

                getUser: (_name) => message.mentions.users.first() ?? null,
                getMember: (_name) => message.mentions.members.first() ?? null,
                getChannel: (_name) => message.mentions.channels.first() ?? message.channel,
                getRole: (_name) => message.mentions.roles.first() ?? null,
                getBoolean: (_name) => args.includes('true'),
                getAttachment: (_name) => message.attachments.first() ?? null,
            },
        };

        try {
            const guildConfig = await getGuildConfig(client, message.guild.id);
            await command.execute(fakeInteraction, guildConfig, client);
        } catch (error) {
            logger.error(`Error executing prefix command "${commandName}":`, error);
            message.channel.send('❌ An error occurred while running this command. Please try the slash command (/) version instead.');
        }
    }
};
