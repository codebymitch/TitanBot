import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getColor } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Kürze eine URL mit is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("Die URL, die gekürzt werden soll")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Eigenes URL-Ende (optional)")
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

        const url = interaction.options.getString("url")!;
        const custom = interaction.options.getString("custom");

        try {
            new URL(url);
        } catch (e) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Ungültiges URL-Format. Gib http:// oder https:// mit an.',
            });
        }

        if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Das URL-Ende darf nur Buchstaben, Zahlen, Unterstriche und Bindestriche enthalten.',
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
                    'User-Agent': 'NexoBot URL Shortener/1.0'
                }
            });
        } catch (networkError) {
            const message = (networkError as { name?: string } | null | undefined)?.name === 'AbortError'
                ? 'Der URL-Kürzer hat nicht rechtzeitig geantwortet. Versuch es gleich noch mal.'
                : 'Der URL-Kürzer ist gerade nicht erreichbar. Versuch es später noch mal.';
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
                message: `Der URL-Kürzer hat HTTP ${response.status} zurückgegeben. Versuch es später noch mal.`,
            });
        }

        const shortUrl = await response.text();

        try {
            new URL(shortUrl);
        } catch (e) {
            if (shortUrl.includes("already exists")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Dieses URL-Ende ist schon vergeben. Probier ein anderes.',
                });
            } else if (shortUrl.includes("invalid")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Ungültige URL. Gib http:// oder https:// mit an.',
                });
            }
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `URL konnte nicht gekürzt werden: ${shortUrl}`,
            });
        }

        const embed = successEmbed('URL gekürzt', `Hier ist deine gekürzte URL: ${shortUrl}`);
        embed.setColor(getColor('success'));
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
} satisfies Command;