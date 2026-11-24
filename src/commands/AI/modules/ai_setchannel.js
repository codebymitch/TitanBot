import { PermissionsBitField, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { setAiChannel, isAiConfigured } from '../../../services/aiChatService.js';

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
            const guildId = interaction.guildId;
            const channel = interaction.options.getChannel('channel');

            await setAiChannel(client, guildId, channel.id);

            const note = isAiConfigured()
                ? ''
                : '\n\nCatatan: **AI_API_KEY** belum di-set, jadi AI belum bisa bales. Minta admin isi dulu di file `.env` ya.';

            const embed = successEmbed(
                'AI Auto Chat Aktif',
                `Sip! AI sekarang otomatis bales setiap pesan member di ${channel}.${note}`,
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_setchannel error:', error);
            const embed = warningEmbed('Gagal Menyimpan', 'Nggak bisa nyimpen channel AI. Coba lagi nanti ya.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
