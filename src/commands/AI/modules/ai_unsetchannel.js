import { PermissionsBitField, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { clearAiChannel } from '../../../services/aiChatService.js';

export default {
    async execute(interaction, config, client) {
        const permissions = interaction.member?.permissions;
        const allowed = permissions?.has(PermissionsBitField.Flags.Administrator)
            || permissions?.has(PermissionsBitField.Flags.ManageGuild);

        if (!allowed) {
            const embed = warningEmbed(
                'Akses Ditolak',
                'Kamu butuh permission **Administrator** atau **Manage Server** buat ngatur AI Auto Chat.',
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await clearAiChannel(client, interaction.guildId);

            const embed = successEmbed(
                'AI Auto Chat Dimatikan',
                'Oke, AI udah nggak bakal bales otomatis lagi. Channel AI-nya udah dinonaktifin.',
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_unsetchannel error:', error);
            const embed = warningEmbed('Gagal Menonaktifkan', 'Nggak bisa matiin AI Auto Chat. Coba lagi nanti ya.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
