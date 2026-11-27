import { PermissionsBitField, MessageFlags } from 'discord.js';
import { clearConversation, getConversation } from '../../../services/aiChatService.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk menghapus riwayat AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            const existing = await getConversation(client, interaction.guildId, channel.id);

            if (existing.length === 0) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [warningEmbed('Riwayat Kosong', `Tidak ada riwayat percakapan AI di ${channel}.`)],
                    flags: MessageFlags.Ephemeral,
                });
            }

            await clearConversation(client, interaction.guildId, channel.id);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Riwayat AI Dihapus', `Riwayat percakapan AI di ${channel} sudah dihapus (${existing.length} pesan).`)],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_reset error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Menghapus', 'Tidak bisa menghapus riwayat AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
