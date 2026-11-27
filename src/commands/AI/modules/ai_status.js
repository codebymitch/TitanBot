import { PermissionsBitField, MessageFlags } from 'discord.js';
import { getAiChatConfig, getConversation, isAiConfigured, getAiSettings } from '../../../services/aiChatService.js';
import { createEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk melihat pengaturan AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const aiConfig = await getAiChatConfig(client, interaction.guildId);
            const settings = getAiSettings();

            let historyCount = 0;
            if (aiConfig.channelId) {
                const history = await getConversation(client, interaction.guildId, aiConfig.channelId);
                historyCount = history.length;
            }

            const persona = aiConfig.systemPrompt
                ? aiConfig.systemPrompt.length > 300
                    ? `${aiConfig.systemPrompt.slice(0, 300)}…`
                    : aiConfig.systemPrompt
                : '*Default (belum di-set)*';

            const embed = createEmbed({
                title: 'Status AI Chat',
                description: 'Pengaturan AI chat untuk server ini.',
                color: 'primary',
                fields: [
                    { name: 'Status', value: aiConfig.enabled ? 'Aktif' : 'Nonaktif', inline: true },
                    { name: 'Channel', value: aiConfig.channelId ? `<#${aiConfig.channelId}>` : 'Belum di-set', inline: true },
                    { name: 'API Terkonfigurasi', value: isAiConfigured() ? 'Ya' : 'Tidak (owner belum set API key)', inline: true },
                    { name: 'Model (server)', value: aiConfig.model || `*Default: ${settings.model}*`, inline: true },
                    { name: 'Riwayat Percakapan', value: `${historyCount} pesan`, inline: true },
                    { name: 'Cooldown', value: `${Math.round((settings.cooldownMs || 0) / 1000)} detik`, inline: true },
                    { name: 'Persona / System Prompt', value: persona, inline: false },
                ],
            });

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_status error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Memuat', 'Tidak bisa memuat pengaturan AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
