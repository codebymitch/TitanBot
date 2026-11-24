import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import aiChat from './modules/ai_chat.js';
import aiReset from './modules/ai_reset.js';
import aiSetChannel from './modules/ai_setchannel.js';
import aiUnsetChannel from './modules/ai_unsetchannel.js';
import aiChannel from './modules/ai_channel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Ngobrol sama AI atau atur AI Auto Chat di server ini')
        .addSubcommand(subcommand =>
            subcommand
                .setName('chat')
                .setDescription('Ngobrol, curhat, atau nanya apa aja sama AI')
                .addStringOption(option =>
                    option
                        .setName('pesan')
                        .setDescription('Pesan atau pertanyaan buat AI')
                        .setRequired(true)
                        .setMaxLength(1900)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Hapus riwayat obrolan kamu sama AI di server ini')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Tentukan channel buat AI Auto Chat (perlu Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel yang member-nya bakal dibalas otomatis sama AI')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unsetchannel')
                .setDescription('Matikan AI Auto Chat di server ini (perlu Manage Server)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Lihat channel AI Auto Chat yang lagi aktif')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'chat':
                return await aiChat.execute(interaction, config, client);
            case 'reset':
                return await aiReset.execute(interaction, config, client);
            case 'setchannel':
                return await aiSetChannel.execute(interaction, config, client);
            case 'unsetchannel':
                return await aiUnsetChannel.execute(interaction, config, client);
            case 'channel':
                return await aiChannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand' });
        }
    }
};
