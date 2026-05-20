import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';

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

    async execute(interaction, config) {
        try {
            const lang = pickLanguage(config, interaction.guild);
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
                `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                logger.info(`Weather command - city not found`, {
                    userId: interaction.user.id,
                    city: city,
                    guildId: interaction.guildId
                });
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            t(lang, 'wolf.cmd.utility.weather.cityNotFoundTitle'),
                            t(lang, 'wolf.cmd.utility.weather.cityNotFoundDesc', { city }),
                        ),
                    ],
                });
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            const cityDisplay = name;

            const weatherResponse = await fetch(
                `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            );
            const weatherData = await weatherResponse.json();

            if (weatherData.error) {
                logger.error(`Weather API error`, {
                    error: weatherData.reason,
                    city: city,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            t(lang, 'wolf.cmd.utility.weather.apiErrorTitle'),
                            t(lang, 'wolf.cmd.utility.weather.apiErrorDesc'),
                        ),
                    ],
                });
                return;
            }

            const current = weatherData.current || weatherData.current_weather || {};
            const temperature = current.temperature != null ? Math.round(current.temperature) : "N/A";
            const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "N/A";
            const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "N/A";
            const weatherCode = current.weathercode ?? current.weather_code ?? null;

            const conditionKey = getWeatherConditionKey(weatherCode);
            const conditionDesc = t(lang, `wolf.cmd.utility.weather.${conditionKey}`);

            const embed = createEmbed({
                title: t(lang, 'wolf.cmd.utility.weather.embedTitle', { city: cityDisplay, country }),
                description: conditionDesc
            })
                .addFields(
                    {
                        name: t(lang, 'wolf.cmd.utility.weather.fieldTemperature'),
                        value: `${temperature}°C`,
                        inline: true,
                    },
                    {
                        name: t(lang, 'wolf.cmd.utility.weather.fieldHumidity'),
                        value: `${humidity}%`,
                        inline: true,
                    },
                    {
                        name: t(lang, 'wolf.cmd.utility.weather.fieldWindSpeed'),
                        value: `${windSpeed} km/h`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Latitude: ${latitude.toFixed(2)} | Longitude: ${longitude.toFixed(2)}`,
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Weather command executed`, {
                userId: interaction.user.id,
                city: cityDisplay,
                country: country,
                temperature: temperature,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Weather command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'weather',
                source: 'weather_command'
            });
        }
    },
};

function getWeatherConditionKey(code) {
    if (code >= 0 && code <= 3) return 'conditionClear';
    if (code >= 45 && code <= 48) return 'conditionFog';
    if (code >= 51 && code <= 67) return 'conditionRain';
    if (code >= 71 && code <= 75) return 'conditionSnow';
    if (code >= 80 && code <= 86) return 'conditionShowers';
    if (code >= 95 && code <= 99) return 'conditionThunderstorm';
    return 'conditionUnknown';
}
