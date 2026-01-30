import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const url = interaction.options.getString("url");
        const custom = interaction.options.getString("custom");

        // Basic URL validation
        try {
            new URL(url);
        } catch (e) {
            return interaction.editReply({
                embeds: [errorEmbed("Invalid URL", "Please provide a valid URL (include http:// or https://)")],
            });
        }

        try {
            // Build the API URL
            let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
            
            if (custom) {
                // Basic validation for custom URL
                if (!/^[a-zA-Z0-9_-]+$/.test(custom)) {
                    return interaction.editReply({
                        embeds: [errorEmbed("Invalid Custom URL", "Custom URL can only contain letters, numbers, underscores, and hyphens.")],
                    });
                }
                apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
            }

            const response = await fetch(apiUrl);
            const shortUrl = await response.text();

            // Check if the response is a valid URL
            try {
                new URL(shortUrl);
                
                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "URL Shortened",
                            `Here's your shortened URL: ${shortUrl}`
                        ),
                    ],
                });
            } catch (e) {
                // If not a valid URL, it's probably an error message
                let errorMessage = "Failed to shorten URL. " + shortUrl;
                if (shortUrl.includes("already exists")) {
                    errorMessage = "That custom URL is already taken. Please try a different one.";
                } else if (shortUrl.includes("invalid")) {
                    errorMessage = "Invalid URL. Please include http:// or https://";
                }
                
                return interaction.editReply({
                    embeds: [errorEmbed("Error", errorMessage)],
                });
            }
        } catch (error) {
            console.error("Error in shorten command:", error);
            return interaction.editReply({
                embeds: [errorEmbed("Error", "An error occurred while shortening the URL.")],
            });
        }
    },
};
