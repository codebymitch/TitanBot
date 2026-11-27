import { PermissionsBitField, MessageFlags } from 'discord.js';
import { updateAiChatConfig, getDefaultModel } from '../../../services/aiChatService.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Akses Ditolak', 'Kamu butuh permission **Manage Server** untuk mengubah model AI.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const name = interaction.options.getString('name');

        try {
            await updateAiChatConfig(client, interaction.guildId, {
                model: name ? name.trim() : null,
            });

            const embed = name
                ? successEmbed('Model AI Diperbarui', `Server ini sekarang memakai model \`${name.trim()}\`.`)
                : successEmbed('Model AI Direset', `Model AI dikembalikan ke default (\`${getDefaultModel()}\`).`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_model error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('Gagal Menyimpan', 'Tidak bisa menyimpan model AI. Coba lagi nanti.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
