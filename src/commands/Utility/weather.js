import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';


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
        await interaction.deferReply();
        const city = interaction.options.getString("city");

        try {
            // --- Step 1: Get Coordinates (Geocoding) ---
            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "City Not Found",
                            `Could not find a location for **${city}**. Please check the spelling.`,
                        ),
                    ],
                });
            }

            // Use the top result's coordinates
            const location = geoData.results[0];
            const latitude = location.latitude;
            const longitude = location.longitude;
            const cityDisplay = location.name;
            const country = location.country;

            const weatherParams =
                "current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m";
            const weatherUrl = `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&${weatherParams}&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;

            const weatherResponse = await fetch(weatherUrl);
            const weatherData = await weatherResponse.json();

            // Check for API system errors
            if (weatherData.error) {
                console.error("Open-Meteo API Error:", weatherData.reason);
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "API Error",
                            "A weather service error occurred.",
                        ),
                    ],
                });
            }

            // Extract values
            const current = weatherData.current;
            const temperature = Math.round(current.temperature_2m);
            const humidity = current.relative_humidity_2m;
            const windSpeed = Math.round(current.wind_speed_10m);
            const weatherCode = current.weather_code;

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

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Weather command general error:", error);
            await interaction.editReply({
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
