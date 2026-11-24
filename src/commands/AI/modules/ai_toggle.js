import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getAiChatConfig, updateAiChatConfig, isAiConfigured } from '../../../services/aiChatService.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengubah pengaturan AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const current = await getAiChatConfig(client, interaction.guildId);
            const nextEnabled = !current.enabled;

            if (nextEnabled && !current.channelId) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [warningEmbed('Channel Belum Di-set', 'Set channel AI dulu dengan `/ai setchannel` sebelum mengaktifkan AI chat.')],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (nextEnabled && !isAiConfigured()) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [warningEmbed('AI Belum Dikonfigurasi', 'Owner bot belum mengatur API key AI. Fitur ini belum bisa dipakai.')],
                    flags: MessageFlags.Ephemeral,
                });
            }

            await updateAiChatConfig(client, interaction.guildId, { enabled: nextEnabled });

            const embed = nextEnabled
                ? successEmbed('AI Chat Diaktifkan', `AI chat aktif dan akan membalas pesan di <#${current.channelId}>.`)
                : successEmbed('AI Chat Dinonaktifkan', 'AI chat sudah dimatikan. Bot tidak akan membalas lagi sampai diaktifkan kembali.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_toggle error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan pengaturan AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
