import axios from 'axios';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
    "4e44d9029b1270a757cddc766a1bcb63";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const MAX_RESULTS = 5;

// Migrated from: commands/Search/movie.js
export default {
    data: new SlashCommandBuilder()
        .setName("movie")
        .setDescription("Search for a movie or TV show")
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("The title of the movie or TV show")
                .setRequired(true)
                .setMaxLength(100),
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type of content to search for")
                .addChoices(
                    { name: "Movie", value: "movie" },
                    { name: "TV Show", value: "tv" },
                )
                .setRequired(false),
        ),
    async execute(interaction) {
try {
            // Check if movie search is enabled in the guild config
            const guildConfig = await getGuildConfig(
                interaction.client,
                interaction.guild?.id,
            );
            if (guildConfig?.disabledCommands?.includes("movie")) {
                return await interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Command Disabled",
                            "The movie/TV show search command is disabled in this server.",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }

            // Check if API key is available
            if (!TMDB_API_KEY) {
                console.error("TMDB API key is not configured");
                return await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Configuration Error",
                            "Movie/TV show search is not properly configured.",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }

            const title = interaction.options.getString("title");
            const type = interaction.options.getString("type") || "movie";

            // Show typing indicator while searching

            // Search for the movie/TV show
            const searchResponse = await axios.get(
                `https://api.themoviedb.org/3/search/${type}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        query: title,
                        include_adult: guildConfig?.allowNsfwContent
                            ? undefined
                            : false,
                        language: guildConfig?.language || "en-US",
                        page: 1,
                        region: guildConfig?.region || "US",
                    },
                    timeout: 8000, // 8 second timeout
                },
            );

            if (!searchResponse.data?.results?.length) {
                return await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Not Found",
                            `No ${type === "movie" ? "movies" : "TV shows"} found for "${title}".`,
                        ),
                    ],
                });
            }

            // Get the first result
            const result = searchResponse.data.results[0];
            const mediaType = type === "movie" ? "Movie" : "TV Show";
            const mediaTitle = result.title || result.name || "Unknown Title";
            const releaseDate = result.release_date || result.first_air_date;
            const year = releaseDate
                ? new Date(releaseDate).getFullYear()
                : "N/A";

            // Get additional details
            const detailsResponse = await axios.get(
                `https://api.themoviedb.org/3/${type}/${result.id}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: guildConfig?.language || "en-US",
                        append_to_response:
                            "credits,release_dates,content_ratings",
                    },
                    timeout: 8000,
                },
            );

            const details = detailsResponse.data;
            const runtime = details.runtime
                ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                : details.episode_run_time?.[0]
                  ? `${details.episode_run_time[0]}m per episode`
                  : "N/A";

            // Get content rating
            let contentRating = "N/A";
            if (type === "movie") {
                const usCert = details.release_dates?.results?.find(
                    (r) => r.iso_3166_1 === "US",
                );
                if (usCert?.release_dates?.[0]?.certification) {
                    contentRating = usCert.release_dates[0].certification;
                }
            } else {
                const usCert = details.content_ratings?.results?.find(
                    (r) => r.iso_3166_1 === "US",
                );
                if (usCert?.rating) {
                    contentRating = usCert.rating;
                }
            }

            // Format genres
            const genres =
                details.genres?.map((g) => g.name).join(", ") || "N/A";

            // Format cast (top 3)
            const cast =
                details.credits?.cast
                    ?.slice(0, 3)
                    .map((p) => p.name)
                    .join(", ") || "N/A";

            // Create the embed with successEmbed for consistent styling
            const embed = successEmbed(
                details.overview || "No overview available.",
                `${mediaTitle} (${year})`
            )
                .setURL(`https://www.themoviedb.org/${type}/${result.id}`)
                .setThumbnail(
                    result.poster_path
                        ? `${IMAGE_BASE_URL}${result.poster_path}`
                        : null,
                )
                .addFields(
                    { name: "Type", value: mediaType, inline: true },
                    {
                        name: "Rating",
                        value: result.vote_average
                            ? `⭐ ${result.vote_average.toFixed(1)}/10 (${result.vote_count.toLocaleString()} votes)`
                            : "N/A",
                        inline: true,
                    },
                    {
                        name: "Content Rating",
                        value: contentRating,
                        inline: true,
                    },
                    { name: "Runtime", value: runtime, inline: true },
                    {
                        name: "Release Date",
                        value: releaseDate
                            ? new Date(releaseDate).toLocaleDateString()
                            : "N/A",
                        inline: true,
                    },
                    { name: "Genres", value: genres, inline: true },
                    { name: "Cast", value: cast, inline: false },
                )
                .setFooter({
                    text: "Powered by The Movie Database",
                    iconURL:
                        "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg",
                });

            // Add backdrop image if available
            if (result.backdrop_path) {
                embed.setImage(
                    `https://image.tmdb.org/t/p/w1280${result.backdrop_path}`,
                );
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Movie/TV show search error:", error);

            let errorMessage = "Failed to fetch movie/TV show information. ";
            if (error.code === "ECONNABORTED") {
                errorMessage =
                    "The request to TMDB timed out. Please try again later.";
            } else if (error.response?.status === 401) {
                errorMessage =
                    "Invalid TMDB API key. Please contact the bot administrator.";
            } else if (error.response?.status === 404) {
                errorMessage =
                    "The requested movie/TV show could not be found.";
            } else if (error.response?.status === 429) {
                errorMessage =
                    "Too many requests to TMDB. Please try again in a few minutes.";
            } else if (error.response?.data?.status_message) {
                errorMessage += `API Error: ${error.response.data.status_message}`;
            }

            await interaction
                .editReply({
                    embeds: [errorEmbed("Error", errorMessage)],
                    flags: ["Ephemeral"],
                })
                .catch(() => {
                    // If the interaction was already replied to, try a follow-up
                    interaction
                        .followUp({
                            embeds: [errorEmbed("Error", errorMessage)],
                            flags: ["Ephemeral"],
                        })
                        .catch(console.error);
                });
        }
    },
};

// Helper function to get guild config
async function getGuildConfig(client, guildId) {
    if (!guildId) return {};
    try {
        const config = await client.db?.get(`guild_${guildId}_config`);
        return config || {};
    } catch (error) {
        console.error("Error fetching guild config:", error);
        return {};
    }
}
