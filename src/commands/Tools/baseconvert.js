import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

const BASE_ALPHABETS = {
    'BIN': { base: 2, prefix: '0b', name: 'Binary', alphabet: '01' },
    'OCT': { base: 8, prefix: '0o', name: 'Octal', alphabet: '0-7' },
    'DEC': { base: 10, prefix: '', name: 'Decimal', alphabet: '0-9' },
    'HEX': { base: 16, prefix: '0x', name: 'Hexadecimal', alphabet: '0-9A-F' },
    'B64': { base: 64, prefix: 'b64:', name: 'Base64', alphabet: 'A-Za-z0-9+/=' },
    'B36': { base: 36, prefix: '', name: 'Base36', alphabet: '0-9A-Z' },
    'B58': { base: 58, prefix: '', name: 'Base58', alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' },
    'B62': { base: 62, prefix: '', name: 'Base62', alphabet: '0-9A-Za-z' },
};

const BASE_NAMES = Object.entries(BASE_ALPHABETS).map(([key, { name }]) => ({ name: `${key} (${name})`, value: key }));
const BASE_CHARSETS = {
    BIN: '01',
    OCT: '01234567',
    DEC: '0123456789',
    HEX: '0123456789ABCDEF',
    B36: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    B58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    B62: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

function parseBigIntFromBase(value, baseKey) {
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

function formatBigIntToBase(value, baseKey) {
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
        .setDescription('Convert numbers between different bases')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('The number to convert')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Source base/format')
                .setRequired(true)
                .addChoices(...BASE_NAMES))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('Target base/format (default: all)')
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

        try {
            const numberStr = interaction.options.getString('number').trim();
            const fromBase = interaction.options.getString('from');
            const toBase = interaction.options.getString('to');
            
            const { prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];
            
            const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix) 
                ? numberStr.slice(fromPrefix.length) 
                : numberStr;
            
            if (!cleanNumber) {
                const embed = errorEmbed('❌ Empty Input', 'You must provide a number to convert.\n\n**Example:** `/baseconvert number:1010 from:BIN to:DEC`');
                embed.setColor(getColor('error'));
                return interaction.editReply({
                    embeds: [embed],
                });
            }
            
            const alphabet = BASE_ALPHABETS[fromBase].alphabet;
            const regex = new RegExp(`^[${alphabet}]+$`, 'i');
            
            if (!regex.test(cleanNumber)) {
                let examples = '';
                if (fromBase === 'BIN') {
                    examples = '\n\n**Valid:** 101, 1010, 11111 | **Invalid:** 5 (digit 5 not allowed)';
                } else if (fromBase === 'OCT') {
                    examples = '\n\n**Valid:** 77, 123, 755 | **Invalid:** 8 (only 0-7 allowed)';
                } else if (fromBase === 'DEC') {
                    examples = '\n\n**Valid:** 42, 123, 999 | **Invalid:** 12.34 (no decimals)';
                } else if (fromBase === 'HEX') {
                    examples = '\n\n**Valid:** FF, A1B2, DEADBEEF | **Invalid:** G (only 0-9, A-F)';
                }
                const embed = errorEmbed(
                    `❌ Invalid ${fromName}`,
                    `You provided: \`${cleanNumber}\`\n\nValid characters: \`${alphabet}\`${examples}`
                );
                embed.setColor(getColor('error'));
                logger.warn(`Invalid base conversion input: ${cleanNumber} for base ${fromBase}`);
                return interaction.editReply({
                    embeds: [embed],
                });
            }
            
            let decimalValue;
            try {
                if (fromBase === 'B64') {
                    decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
                } else {
                    decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
                }
            } catch (error) {
                logger.error('Base conversion parse error:', error);
                const embed = errorEmbed('⚠️ Conversion Failed', 'The number is too large to process.\n\nTry with a smaller number.');
                embed.setColor(getColor('error'));
                return interaction.editReply({
                    embeds: [embed],
                });
            }
            
            if (toBase) {
                const { prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
                let result;
                
                try {
                    result = formatBigIntToBase(decimalValue, toBase);
                    
                    const embed = successEmbed(
                        '🔄 Base Conversion Result',
                        `**From ${fromName} (${fromBase}):** \`${fromPrefix}${cleanNumber}\`\n` +
                        `**To ${toName} (${toBase}):** \`${toPrefix}${result}\`\n` +
                        `**Decimal:** \`${decimalValue.toLocaleString()}\``
                    );
                    embed.setColor(getColor('success'));
                    
                    await interaction.editReply({ embeds: [embed] });
                    
                } catch (error) {
                    logger.error(`Base conversion error to ${toName}:`, error);
                    const embed = errorEmbed(`⚠️ Failed to Convert to ${toName}`, 'The result would be too large or incompatible.\n\nTry with a smaller number or different target base.');
                    embed.setColor(getColor('error'));
                    await interaction.editReply({
                        embeds: [embed]
                    });
                }
                
            } else {
                let description = `**Input (${fromName}):** \`${fromPrefix}${cleanNumber}\`\n`;
                description += `**Decimal:** \`${decimalValue.toLocaleString()}\`\n\n`;
                
                for (const [baseKey, { prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                    if (baseKey === fromBase) continue;
                    
                    try {
                        let value = formatBigIntToBase(decimalValue, baseKey);
                        
                        description += `**${name} (${baseKey}):** \`${prefix}${value}\`\n`;
                    } catch (error) {
                        description += `**${name} (${baseKey}):** *Too large to convert*\n`;
                    }
                }
                
                const embed = successEmbed(
                    '🔄 Base Conversion Results',
                    description
                );
                embed.setColor(getColor('primary'));
                
                await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'baseconvert'
            });
        }
    },
};



