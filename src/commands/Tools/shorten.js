import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Shorten a URL using is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("The URL to shorten")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Custom URL ending (optional)")
                .setRequired(false)
        )
        .setDMPermission(false),
    category: "Tools",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferSuccess) {
            logger.warn(`Shorten interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        try {
            const url = interaction.options.getString("url");
            const custom = interaction.options.getString("custom");

            try {
                new URL(url);
            } catch (e) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Invalid URL format. Include http:// or https://',
                });
            }

            if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Custom URL can only contain letters, numbers, underscores, and hyphens.',
                });
            }

            let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
            if (custom) {
                apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            let response;
            try {
                response = await fetch(apiUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'TitanBot URL Shortener/1.0'
                    }
                });
            } catch (networkError) {
                const message = networkError?.name === 'AbortError'
                    ? 'The URL shortener timed out. Please try again in a moment.'
                    : 'Unable to reach the URL shortener service right now. Please try again later.';
                return replyUserError(interaction, {
                    type: ErrorTypes.NETWORK,
                    message,
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Shortener service returned HTTP ${response.status}. Please try again later.`,
                });
            }

            const shortUrl = await response.text();

            try {
                new URL(shortUrl);
            } catch (e) {
                if (shortUrl.includes("already exists")) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'That custom URL is already taken. Try a different one.',
                    });
                } else if (shortUrl.includes("invalid")) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Invalid URL. Include http:// or https://',
                    });
                }
                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `URL shortening failed: ${shortUrl}`,
                });
            }

            const embed = successEmbed('URL Shortened', `Here's your shortened URL: ${shortUrl}`);
            embed.setColor(getColor('success'));
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'shorten'
            });
        }
    },
};