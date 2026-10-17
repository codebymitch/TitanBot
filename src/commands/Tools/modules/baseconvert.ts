import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getColor } from '../../../config/bot.js';
import type { Command } from '../../../types/index.js';

interface BaseInfo {
    base: number;
    prefix: string;
    name: string;
    alphabet: string;
}

const BASE_ALPHABETS: Record<string, BaseInfo> = {
    'BIN': { base: 2, prefix: '0b', name: 'Binär', alphabet: '01' },
    'OCT': { base: 8, prefix: '0o', name: 'Oktal', alphabet: '0-7' },
    'DEC': { base: 10, prefix: '', name: 'Dezimal', alphabet: '0-9' },
    'HEX': { base: 16, prefix: '0x', name: 'Hexadezimal', alphabet: '0-9A-F' },
    'B64': { base: 64, prefix: 'b64:', name: 'Base64', alphabet: 'A-Za-z0-9+/=' },
    'B36': { base: 36, prefix: '', name: 'Base36', alphabet: '0-9A-Z' },
    'B58': { base: 58, prefix: '', name: 'Base58', alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' },
    'B62': { base: 62, prefix: '', name: 'Base62', alphabet: '0-9A-Za-z' },
};

const BASE_NAMES = Object.entries(BASE_ALPHABETS).map(([key, { name }]) => ({ name: `${key} (${name})`, value: key }));
const BASE_CHARSETS: Record<string, string | undefined> = {
    BIN: '01',
    OCT: '01234567',
    DEC: '0123456789',
    HEX: '0123456789ABCDEF',
    B36: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    B58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    B62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

function parseBigIntFromBase(value: string, baseKey: string): bigint {
    if (baseKey === 'B64') {
        const bytes = Buffer.from(value, 'base64');
        return bytes.reduce((acc, byte) => (acc * 256n) + BigInt(byte), 0n);
    }

    const charset = BASE_CHARSETS[baseKey];
    if (!charset) {
        throw new Error(`Unsupported base: ${baseKey}`);
    }

    const normalized = ['BIN', 'OCT', 'DEC', 'HEX', 'B36'].includes(baseKey)
        ? value.toUpperCase()
        : value;

    let result = 0n;
    const base = BigInt(charset.length);

    for (const char of normalized) {
        const digit = charset.indexOf(char);
        if (digit < 0) {
            throw new Error(`Invalid character '${char}' for base ${baseKey}`);
        }
        result = (result * base) + BigInt(digit);
    }

    return result;
}

function formatBigIntToBase(value: bigint, baseKey: string): string {
    if (baseKey === 'B64') {
        if (value === 0n) {
            return Buffer.from([0]).toString('base64');
        }

        const bytes = [];
        let n = value;
        while (n > 0n) {
            bytes.unshift(Number(n & 0xffn));
            n >>= 8n;
        }

        return Buffer.from(bytes).toString('base64');
    }

    const charset = BASE_CHARSETS[baseKey];
    if (!charset) {
        throw new Error(`Unsupported base: ${baseKey}`);
    }

    if (value === 0n) {
        return '0';
    }

    const base = BigInt(charset.length);
    let n = value;
    let output = '';

    while (n > 0n) {
        const index = Number(n % base);
        output = charset[index] + output;
        n /= base;
    }

    return output;
}

export default {
    data: new SlashCommandBuilder()
        .setName('baseconvert')
        .setDescription('Rechne Zahlen zwischen verschiedenen Zahlensystemen um')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('Die Zahl, die umgerechnet werden soll')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Ausgangssystem/-format')
                .setRequired(true)
                .addChoices(...BASE_NAMES))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('Zielsystem/-format (Standard: alle)')
                .setRequired(false)
                .addChoices(...BASE_NAMES)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`BaseConvert interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'baseconvert'
            });
            return;
        }

        const numberStr = interaction.options.getString('number')!.trim();
        const fromBase = interaction.options.getString('from')!;
        const toBase = interaction.options.getString('to');

        const { prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];

        const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix)
            ? numberStr.slice(fromPrefix.length)
            : numberStr;

        if (!cleanNumber) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Gib eine Zahl zum Umrechnen an.\n\n**Beispiel:** `/tools baseconvert number:1010 from:BIN to:DEC`',
            });
        }

        const alphabet = BASE_ALPHABETS[fromBase].alphabet;
        const regex = new RegExp(`^[${alphabet}]+$`, 'i');

        if (!regex.test(cleanNumber)) {
            let examples = '';
            if (fromBase === 'BIN') {
                examples = '\n\n**Gültig:** 101, 1010, 11111 | **Ungültig:** 5 (Ziffer 5 nicht erlaubt)';
            } else if (fromBase === 'OCT') {
                examples = '\n\n**Gültig:** 77, 123, 755 | **Ungültig:** 8 (nur 0-7 erlaubt)';
            } else if (fromBase === 'DEC') {
                examples = '\n\n**Gültig:** 42, 123, 999 | **Ungültig:** 12.34 (keine Nachkommastellen)';
            } else if (fromBase === 'HEX') {
                examples = '\n\n**Gültig:** FF, A1B2, DEADBEEF | **Ungültig:** G (nur 0-9, A-F)';
            }
            logger.warn(`Invalid base conversion input: ${cleanNumber} for base ${fromBase}`);
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `Deine Eingabe: \`${cleanNumber}\`\n\nGültige Zeichen: \`${alphabet}\`${examples}`,
            });
        }

        let decimalValue: bigint;
        try {
            if (fromBase === 'B64') {
                decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
            } else {
                decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
            }
        } catch (error) {
            logger.error('Base conversion parse error:', error);
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Die Zahl ist zu groß zum Verarbeiten.\n\nVersuch es mit einer kleineren Zahl.',
            });
        }

        if (toBase) {
            const { prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
            let result;

            try {
                result = formatBigIntToBase(decimalValue, toBase);

                const embed = successEmbed(
                    '🔄 Ergebnis der Umrechnung',
                    `**Von ${fromName} (${fromBase}):** \`${fromPrefix}${cleanNumber}\`\n` +
                    `**Nach ${toName} (${toBase}):** \`${toPrefix}${result}\`\n` +
                    `**Dezimal:** \`${decimalValue.toLocaleString()}\``
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            } catch (error) {
                logger.error(`Base conversion error to ${toName}:`, error);
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Das Ergebnis wäre zu groß oder nicht kompatibel.\n\nVersuch es mit einer kleineren Zahl oder einem anderen Zielsystem.',
                });
            }

        } else {
            let description = `**Eingabe (${fromName}):** \`${fromPrefix}${cleanNumber}\`\n`;
            description += `**Dezimal:** \`${decimalValue.toLocaleString()}\`\n\n`;

            for (const [baseKey, { prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                if (baseKey === fromBase) continue;

                try {
                    let value = formatBigIntToBase(decimalValue, baseKey);

                    description += `**${name} (${baseKey}):** \`${prefix}${value}\`\n`;
                } catch (error) {
                    description += `**${name} (${baseKey}):** *Zu groß zum Umrechnen*\n`;
                }
            }

            const embed = successEmbed(
                '🔄 Ergebnisse der Umrechnung',
                description
            );
            embed.setColor(getColor('primary'));

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    },
} satisfies Command;