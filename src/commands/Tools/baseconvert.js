import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
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
try {
            const numberStr = interaction.options.getString('number').trim();
            const fromBase = interaction.options.getString('from');
            const toBase = interaction.options.getString('to');
            
            const { base: fromBaseValue, prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];
            
            const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix) 
                ? numberStr.slice(fromPrefix.length) 
                : numberStr;
            
            if (!cleanNumber) {
                const embed = errorEmbed('Error', 'Please provide a valid number to convert.');
                embed.setColor(getColor('error'));
                return interaction.reply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }
            
            const alphabet = BASE_ALPHABETS[fromBase].alphabet;
            const regex = new RegExp(`^[${alphabet}]+$`, 'i');
            
            if (!regex.test(cleanNumber)) {
                const embed = errorEmbed(
                    'Invalid Input', 
                    `The input is not a valid ${fromName} number. ` +
                    `Valid characters for ${fromBase} (${fromName}): ${alphabet}`
                );
                embed.setColor(getColor('error'));
                logger.warn(`Invalid base conversion input: ${cleanNumber} for base ${fromBase}`);
                return interaction.editReply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }
            
            let decimalValue;
            try {
                if (fromBase === 'B64') {
                    decimalValue = BigInt(Buffer.from(cleanNumber, 'base64').reduce((a, b) => a * 256n + BigInt(b), 0n));
                } else {
                    decimalValue = BigInt(cleanNumber, fromBaseValue);
                }
            } catch (error) {
                logger.error('Base conversion parse error:', error);
                const embed = errorEmbed('Conversion Error', 'Failed to parse the input number. It may be too large or invalid.');
                embed.setColor(getColor('error'));
                return interaction.editReply({
                    embeds: [embed],
                    flags: ['Ephemeral']
                });
            }
            
            if (toBase) {
                const { base: toBaseValue, prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
                let result;
                
                try {
                    if (toBase === 'B64') {
                        const bytes = [];
                        let n = decimalValue;
                        while (n > 0n) {
                            bytes.unshift(Number(n & 0xffn));
                            n >>= 8n;
                        }
                        result = Buffer.from(bytes).toString('base64');
                    } else {
                        result = decimalValue.toString(toBaseValue).toUpperCase();
                    }
                    
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
                    const embed = errorEmbed('Conversion Error', `Failed to convert to ${toName}. The number might be too large.`);
                    embed.setColor(getColor('error'));
                    await interaction.editReply({
                        embeds: [embed]
                    });
                }
                
            } else {
                let description = `**Input (${fromName}):** \`${fromPrefix}${cleanNumber}\`\n`;
                description += `**Decimal:** \`${decimalValue.toLocaleString()}\`\n\n`;
                
                for (const [baseKey, { base, prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                    if (baseKey === fromBase) continue;
                    
                    try {
                        let value;
                        if (baseKey === 'B64') {
                            const bytes = [];
                            let n = decimalValue;
                            while (n > 0n) {
                                bytes.unshift(Number(n & 0xffn));
                                n >>= 8n;
                            }
                            value = Buffer.from(bytes).toString('base64');
                        } else {
                            value = decimalValue.toString(base).toUpperCase();
                        }
                        
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



