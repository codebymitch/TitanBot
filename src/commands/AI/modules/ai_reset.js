import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { clearHistory } from '../../../services/aiChatService.js';

export default {
    async execute(interaction, config, client) {
        try {
            await clearHistory(interaction.guildId, interaction.user.id);

            const embed = successEmbed(
                'Riwayat Dibersihin',
                'Riwayat obrolan kamu sama AI udah dihapus. Mulai dari nol lagi ya, anggep aja baru kenalan 😄',
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('ai_reset error:', error);
            const embed = warningEmbed('Gagal Reset', 'Nggak bisa ngapus riwayat sekarang. Coba lagi nanti ya.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
