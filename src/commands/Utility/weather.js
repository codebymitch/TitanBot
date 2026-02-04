import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';


// Open-Meteo APIs (Free and NO API Key Required for non-commercial use)
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Get real-time weather information for a location")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("The city name, e.g., 'London' or 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        // Defer early, unless it's already been acknowledged
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const city = interaction.options.getString("city");

            // --- Step 1: Get Coordinates (Geocoding) ---
            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "City Not Found",
                            `Could not find a location for **${city}**. Please check the spelling.`,
                        ),
                    ],
                });
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            const cityDisplay = name;

            // --- Step 2: Get Weather Data ---
            const weatherResponse = await fetch(
                `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            );
            const weatherData = await weatherResponse.json();

            // Check for API system errors
            if (weatherData.error) {
                console.error("Open-Meteo API Error:", weatherData.reason);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "API Error",
                            "A weather service error occurred.",
                        ),
                    ],
                });
                return;
            }

            // Extract values (Open-Meteo uses current_weather)
            const current = weatherData.current || weatherData.current_weather || {};
            const temperature = current.temperature != null ? Math.round(current.temperature) : "N/A";
            const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "N/A";
            const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "N/A";
            const weatherCode = current.weathercode ?? current.weather_code ?? null;

            // Convert WMO Weather Code to a description and emoji
            const condition = getWeatherDescription(weatherCode);

            // --- Step 3: Create the Embed ---
            const embed = createEmbed({ title: `🌎 Weather in ${cityDisplay}, ${country}`, description: condition.description })
                .addFields(
                    {
                        name: "🌡️ Temperature",
                        value: `${temperature}°C`,
                        inline: true,
                    },
                    {
                        name: "💧 Humidity",
                        value: `${humidity}%`,
                        inline: true,
                    },
                    {
                        name: "💨 Wind Speed",
                        value: `${windSpeed} km/h`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Latitude: ${latitude.toFixed(2)} | Longitude: ${longitude.toFixed(2)}`,
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            console.error("Weather command general error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An unexpected error occurred while processing the weather request.",
                    ),
                ],
            });
        }
    },
};

/**
 * Converts the WMO Weather Code (WMO_CODE) to a readable description and emoji.
 * @param {number} code
 */
function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return { description: "Clear sky / Partly cloudy ☀️", emoji: "☀️" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Fog and Rime fog 🌫️", emoji: "🌫️" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Drizzle or Rain 🌧️", emoji: "🌧️" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Snow fall ❄️", emoji: "❄️" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Showers (Rain/Snow) 🌨️", emoji: "🌨️" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Thunderstorm ⛈️", emoji: "⛈️" };
    }
    return { description: "Unknown conditions.", emoji: "" };
}
