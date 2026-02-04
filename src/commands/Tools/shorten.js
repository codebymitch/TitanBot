import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
// Migrated from: commands/Tools/shorten.js
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

    async execute(interaction, config, client) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const url = interaction.options.getString("url");
                const custom = interaction.options.getString("custom");

                // Validate URL format
                try {
                    new URL(url);
                } catch (e) {
                    throw new Error("Invalid URL format. Include http:// or https://");
                }

                // Validate custom URL if provided
                if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                    throw new Error("Custom URL can only contain letters, numbers, underscores, and hyphens.");
                }

                // Build the API URL
                let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
                if (custom) {
                    apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
                }

                const response = await fetch(apiUrl);
                const shortUrl = await response.text();

                // Validate response is a URL
                try {
                    new URL(shortUrl);
                } catch (e) {
                    // Parse error message from API
                    if (shortUrl.includes("already exists")) {
                        throw new Error("That custom URL is already taken. Try a different one.");
                    } else if (shortUrl.includes("invalid")) {
                        throw new Error("Invalid URL. Include http:// or https://");
                    }
                    throw new Error(`URL shortening failed: ${shortUrl}`);
                }

                // Send success response
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed("URL Shortened", `Here's your shortened URL: ${shortUrl}`),
                    ],
                });
            },
            errorEmbed("URL Shortening Failed", "Couldn't shorten that URL. Check the format and try again.")
        );
    },
};
