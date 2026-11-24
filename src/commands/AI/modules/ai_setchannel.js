import { PermissionsBitField, MessageFlags, ChannelType } from 'discord.js';
import { updateAiChatConfig } from '../../../services/aiChatService.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengatur channel AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const channel = interaction.options.getChannel('channel');

        if (channel && channel.type !== ChannelType.GuildText) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Channel Tidak Valid', 'Pilih channel teks untuk AI chat.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await updateAiChatConfig(client, interaction.guildId, {
                channelId: channel ? channel.id : null,
                enabled: Boolean(channel),
            });

            const embed = channel
                ? successEmbed('Channel AI Di-set', `AI chat sekarang aktif di ${channel}. Bot akan membalas pesan di channel tersebut.`)
                : warningEmbed('Channel AI Dihapus', 'Channel AI sudah dihapus dan AI chat dinonaktifkan.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_setchannel error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan channel AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
