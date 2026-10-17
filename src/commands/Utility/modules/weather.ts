import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

interface GeocodingResult {
    latitude: number;
    longitude: number;
    name: string;
    country: string;
}

interface GeocodingResponse {
    results?: GeocodingResult[];
}

interface CurrentWeather {
    temperature?: number | null;
    relativehumidity?: number;
    relative_humidity_2m?: number;
    windspeed?: number | null;
    weathercode?: number;
    weather_code?: number;
}

interface WeatherResponse {
    error?: boolean;
    reason?: string;
    current?: CurrentWeather;
    current_weather?: CurrentWeather;
}

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Aktuelles Wetter für einen Ort abrufen")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("Der Name der Stadt, z. B. 'Berlin' oder 'Tokio'")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Weather interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city!)}`,
        );
        const geoData = await geoResponse.json() as GeocodingResponse;

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Weather command - city not found`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Für **${city}** wurde kein Ort gefunden. Bitte prüf die Schreibweise.` });
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
        );
        const weatherData = await weatherResponse.json() as WeatherResponse;

        if (weatherData.error) {
            logger.error(`Weather API error`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Wetterdienst ist ein Fehler aufgetreten.' });
            return;
        }

        const current: CurrentWeather = weatherData.current || weatherData.current_weather || {};
        const temperature = current.temperature != null ? Math.round(current.temperature) : "–";
        const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "–";
        const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "–";
        const weatherCode = current.weathercode ?? current.weather_code ?? null;

        const condition = getWeatherDescription(weatherCode);

        const embed = createEmbed({ title: `Wetter in ${cityDisplay}, ${country}`, description: condition.description })
            .addFields(
                {
                    name: "Temperatur",
                    value: `${temperature}°C`,
                    inline: true,
                },
                {
                    name: "Luftfeuchtigkeit",
                    value: `${humidity}%`,
                    inline: true,
                },
                {
                    name: "Windgeschwindigkeit",
                    value: `${windSpeed} km/h`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Breitengrad: ${latitude.toFixed(2)} | Längengrad: ${longitude.toFixed(2)}`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        logger.info(`Weather command executed`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: temperature,
            guildId: interaction.guildId
        });
    },
} satisfies Command;

function getWeatherDescription(codeValue: number | null) {
    // Number(null) === 0, same coercion the relational operators applied in JS
    const code = Number(codeValue);
    if (code >= 0 && code <= 3) {
        return { description: "Klar / teilweise bewölkt", emoji: "" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Nebel und Raureifnebel", emoji: "" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Nieselregen oder Regen", emoji: "" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Schneefall", emoji: "" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Schauer (Regen/Schnee)", emoji: "" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Gewitter", emoji: "" };
    }
    return { description: "Unbekannte Wetterlage.", emoji: "" };
}