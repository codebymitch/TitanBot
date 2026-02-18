import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

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
        try {
            const url = interaction.options.getString("url");
            const custom = interaction.options.getString("custom");

            try {
                new URL(url);
            } catch (e) {
                const embed = errorEmbed("Invalid URL", "Invalid URL format. Include http:// or https://");
                embed.setColor(getColor('error'));
                return interaction.reply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }

            if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                const embed = errorEmbed("Invalid Custom URL", "Custom URL can only contain letters, numbers, underscores, and hyphens.");
                embed.setColor(getColor('error'));
                return interaction.reply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }

            let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
            if (custom) {
                apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
            }

            const response = await fetch(apiUrl);
            const shortUrl = await response.text();

            try {
                new URL(shortUrl);
            } catch (e) {
                if (shortUrl.includes("already exists")) {
                    const embed = errorEmbed("URL Already Taken", "That custom URL is already taken. Try a different one.");
                    embed.setColor(getColor('error'));
                    return interaction.reply({
                        embeds: [embed],
                        flags: ['Ephemeral']
                    });
                } else if (shortUrl.includes("invalid")) {
                    const embed = errorEmbed("Invalid URL", "Invalid URL. Include http:// or https://");
                    embed.setColor(getColor('error'));
                    return interaction.reply({
                        embeds: [embed],
                        flags: ['Ephemeral']
                    });
                }
                const embed = errorEmbed("URL Shortening Failed", `URL shortening failed: ${shortUrl}`);
                embed.setColor(getColor('error'));
                return interaction.reply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }

            const embed = successEmbed("URL Shortened", `Here's your shortened URL: ${shortUrl}`);
            embed.setColor(getColor('success'));
            await interaction.reply({
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


