import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import aiSetChannel from './modules/ai_setchannel.js';
import aiToggle from './modules/ai_toggle.js';
import aiStatus from './modules/ai_status.js';
import aiPersona from './modules/ai_persona.js';
import aiModel from './modules/ai_model.js';
import aiReset from './modules/ai_reset.js';
import aiAsk from './modules/ai_ask.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('AI chat assistant for this server')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Set the channel where the AI replies to messages (Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Text channel for AI chat. Leave empty to remove and disable.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable AI chat on this server (Manage Server)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show the current AI chat settings (Manage Server)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('persona')
                .setDescription('Set the AI personality / system prompt (Manage Server)')
                .addStringOption(option =>
                    option
                        .setName('prompt')
                        .setDescription('New system prompt. Leave empty to reset to the default.')
                        .setMaxLength(1500)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('model')
                .setDescription('Set the AI model used on this server (Manage Server)')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Model name (e.g. gpt-4o-mini). Leave empty to use the default.')
                        .setMaxLength(100)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Clear the AI conversation memory for a channel (Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to clear. Defaults to the current channel.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ask')
                .setDescription('Ask the AI a one-off question')
                .addStringOption(option =>
                    option
                        .setName('prompt')
                        .setDescription('What do you want to ask the AI?')
                        .setMaxLength(2000)
                        .setRequired(true)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'setchannel':
                return await aiSetChannel.execute(interaction, config, client);
            case 'toggle':
                return await aiToggle.execute(interaction, config, client);
            case 'status':
                return await aiStatus.execute(interaction, config, client);
            case 'persona':
                return await aiPersona.execute(interaction, config, client);
            case 'model':
                return await aiModel.execute(interaction, config, client);
            case 'reset':
                return await aiReset.execute(interaction, config, client);
            case 'ask':
                return await aiAsk.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand.' });
        }
    }
};
