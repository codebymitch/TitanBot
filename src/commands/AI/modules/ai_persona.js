import { PermissionsBitField, MessageFlags } from 'discord.js';
import { updateAiChatConfig } from '../../../services/aiChatService.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengubah persona AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const prompt = interaction.options.getString('prompt');

        try {
            await updateAiChatConfig(client, interaction.guildId, {
                systemPrompt: prompt ? prompt.trim() : null,
            });

            const embed = prompt
                ? successEmbed('Persona AI Diperbarui', `AI sekarang memakai system prompt berikut:\n\n>>> ${prompt.trim().slice(0, 1000)}`)
                : successEmbed('Persona AI Direset', 'Persona AI dikembalikan ke default.');

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_persona error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan persona AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
