import { MessageFlags } from 'discord.js';
import { generateReply, splitMessage, checkCooldown, isAiConfigured } from '../../../services/aiChatService.js';
import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const prompt = interaction.options.getString('prompt');

        if (!isAiConfigured()) {
            return replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'AI chat is not configured on this bot. Ask the bot owner to set the AI_API_KEY.',
            });
        }

        const cooldown = checkCooldown(`${interaction.guildId}:${interaction.user.id}`);
        if (!cooldown.allowed) {
            const seconds = Math.ceil(cooldown.retryAfterMs / 1000);
            return replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: `Tunggu **${seconds} detik** lagi sebelum bertanya ke AI lagi.`,
            });
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) {
            return;
        }

        try {
            const reply = await generateReply(client, interaction.guildId, interaction.channelId, prompt, {
                useHistory: false,
            });

            const chunks = splitMessage(reply);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: `🤖 ${client.user?.username || 'AI'}`,
                    description: chunks[0],
                    color: 'primary',
                    footer: `Ditanya oleh ${interaction.user.tag}`,
                })],
            });

            for (const chunk of chunks.slice(1)) {
                await interaction.followUp({ embeds: [infoEmbed('Lanjutan', chunk)] });
            }
        } catch (error) {
            logger.error('ai_ask error:', error);
            await replyUserError(interaction, {
                type: error?.type || ErrorTypes.UNKNOWN,
                message: error?.userMessage || 'AI gagal menjawab. Coba lagi nanti.',
            });
        }
    },
};
