import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
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
                const embed = errorEmbed("Invalid URL", "Invalid URL format. Include http:// or https://");
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                const embed = errorEmbed("Invalid Custom URL", "Custom URL can only contain letters, numbers, underscores, and hyphens.");
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
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
                const embed = errorEmbed('Network Error', message);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                const embed = errorEmbed('URL Shortening Failed', `Shortener service returned HTTP ${response.status}. Please try again later.`);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            const shortUrl = await response.text();

            try {
                new URL(shortUrl);
            } catch (e) {
                if (shortUrl.includes("already exists")) {
                    const embed = errorEmbed("URL Already Taken", "That custom URL is already taken. Try a different one.");
                    embed.setColor(getColor('error'));
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [embed],
                    });
                } else if (shortUrl.includes("invalid")) {
                    const embed = errorEmbed("Invalid URL", "Invalid URL. Include http:// or https://");
                    embed.setColor(getColor('error'));
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [embed],
                    });
                }
                const embed = errorEmbed("URL Shortening Failed", `URL shortening failed: ${shortUrl}`);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            const embed = successEmbed("URL Shortened", `Here's your shortened URL: ${shortUrl}`);
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


