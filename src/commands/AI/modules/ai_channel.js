import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getAiChannelConfig } from '../../../services/aiChatService.js';

export default {
    async execute(interaction, config, client) {
        try {
            const { enabled, channelId } = await getAiChannelConfig(client, interaction.guildId);

            if (!enabled || !channelId) {
                const embed = infoEmbed(
                    'AI Auto Chat Belum Aktif',
                    'Belum ada channel AI yang di-set di server ini. Admin bisa pakai `/ai setchannel` buat ngaktifin.',
                );
                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = infoEmbed(
                'Channel AI Auto Chat',
                `AI lagi otomatis bales pesan member di <#${channelId}>.`,
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_channel error:', error);
            const embed = warningEmbed('Error', 'Nggak bisa ngecek channel AI sekarang. Coba lagi nanti ya.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
