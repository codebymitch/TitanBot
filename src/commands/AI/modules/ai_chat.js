import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { warningEmbed } from '../../../utils/embeds.js';
import { formatCooldownDuration } from '../../../utils/abuseProtection.js';
import { logger } from '../../../utils/logger.js';
import {
    isAiConfigured,
    getCooldownRemaining,
    markCooldown,
    enqueue,
    generateReply,
    getAiErrorMessage,
    splitMessage,
} from '../../../services/aiChatService.js';

export default {
    async execute(interaction, config, client) {
        if (!isAiConfigured()) {
            const embed = warningEmbed(
                'AI Belum Aktif',
                'Fitur AI belum di-setup nih. Admin perlu ngisi **AI_API_KEY** di file `.env` dulu ya.',
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const prompt = interaction.options.getString('pesan');

        const remaining = getCooldownRemaining(guildId, userId);
        if (remaining > 0) {
            const embed = warningEmbed(
                'Sabar Dikit',
                `Sabar ya, tunggu **${formatCooldownDuration(remaining)}** lagi sebelum ngobrol lagi sama AI.`,
            );
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        markCooldown(guildId, userId);

        // Defer publik: munculin indikator "thinking" sekaligus nunjukin AI lagi mikir.
        await InteractionHelper.safeDefer(interaction, {});

        try {
            const displayName = interaction.member?.displayName || interaction.user.username;

            const reply = await enqueue(guildId, userId, () =>
                generateReply(guildId, userId, { userMessage: prompt, displayName }),
            );

            const chunks = splitMessage(reply);

            await InteractionHelper.safeEditReply(interaction, {
                content: chunks[0],
                allowedMentions: { parse: [] },
            });

            for (const chunk of chunks.slice(1)) {
                await interaction
                    .followUp({ content: chunk, allowedMentions: { parse: [] } })
                    .catch(() => null);
            }
        } catch (error) {
            logger.error('ai_chat error:', { guildId, userId, error: error?.message });
            await InteractionHelper.safeEditReply(interaction, { content: getAiErrorMessage(error) });
        }
    },
};
