import { webcrypto as crypto } from 'node:crypto';
import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName('generatepassword')
        .setDescription('Erzeugt ein starkes, zufälliges Passwort')
        .addIntegerOption(option =>
            option.setName('length')
                .setDescription('Passwortlänge (Standard: 16, max.: 50)')
                .setMinValue(8)
                .setMaxValue(50)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('uppercase')
                .setDescription('Großbuchstaben verwenden (A-Z)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('numbers')
                .setDescription('Zahlen verwenden (0-9)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('symbols')
                .setDescription('Sonderzeichen verwenden (!@#$%^&*)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });

        if (!deferSuccess) {
            logger.warn('GeneratePassword interaction defer failed', {
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                commandName: 'generatepassword'
            });
            return;
        }

        const length = interaction.options.getInteger('length') || 16;
        const includeUppercase = interaction.options.getBoolean('uppercase') ?? true;
        const includeNumbers = interaction.options.getBoolean('numbers') ?? true;
        const includeSymbols = interaction.options.getBoolean('symbols') ?? true;

        if (length < 8 || length > 50) {
            await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Das Passwort muss 8-50 Zeichen lang sein. Deine Angabe: ${length}` });
            return;
        }

        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

        let chars = lowercase;
        if (includeUppercase) chars += uppercase;
        if (includeNumbers) chars += numbers;
        if (includeSymbols) chars += symbols;

        let password = '';
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            const randomIndex = randomValues[i] % chars.length;
            password += chars[randomIndex];
        }

        if (includeUppercase && !/[A-Z]/.test(password)) {
            const randomIndex = Math.floor(Math.random() * length);
            const randomUpper = uppercase[Math.floor(Math.random() * uppercase.length)];
            password = password.substring(0, randomIndex) + randomUpper + password.substring(randomIndex + 1);
        }

        if (includeNumbers && !/[0-9]/.test(password)) {
            const randomIndex = Math.floor(Math.random() * length);
            const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];
            password = password.substring(0, randomIndex) + randomNumber + password.substring(randomIndex + 1);
        }

        if (includeSymbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
            const randomIndex = Math.floor(Math.random() * length);
            const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
            password = password.substring(0, randomIndex) + randomSymbol + password.substring(randomIndex + 1);
        }

        let strength = 'Schwach';
        let strengthEmoji = '🔴';
        let strengthColor = getColor('error');

        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSymbol = /[^a-zA-Z0-9]/.test(password);

        const uniqueChars = new Set(password).size;
        const uniqueRatio = uniqueChars / password.length;

        let score = 0;
        score += password.length * 4;
        score += (password.length - (password.match(/[a-z]/g) || []).length) * 2;
        score += (password.length - (password.match(/[A-Z]/g) || []).length) * 2;
        score += (password.match(/[0-9]/g) || []).length * 4;
        score += (password.match(/[^a-zA-Z0-9]/g) || []).length * 6;

        if (uniqueRatio < 0.5) score *= 0.7;
        if (hasLower && hasUpper) score *= 1.2;
        if (hasNumber) score *= 1.2;
        if (hasSymbol) score *= 1.3;

        if (score > 80) {
            strength = 'Sehr stark';
            strengthEmoji = '🟢';
            strengthColor = getColor('success');
        } else if (score > 60) {
            strength = 'Stark';
            strengthEmoji = '🟢';
            strengthColor = getColor('success');
        } else if (score > 40) {
            strength = 'Gut';
            strengthEmoji = '🟡';
            strengthColor = getColor('warning');
        } else if (score > 20) {
            strength = 'Schwach';
            strengthEmoji = '🟠';
            strengthColor = getColor('warning');
        }

        const embed = successEmbed(
            '🔑 Generiertes Passwort',
            `**Passwort:** ||\`${password}\`||\n` +
            `**Länge:** ${password.length} Zeichen\n` +
            `**Stärke:** ${strengthEmoji} ${strength}\n` +
            `**Enthält:** ${hasLower ? 'Kleinbuchstaben' : ''}${hasUpper ? ', Großbuchstaben' : ''}${hasNumber ? ', Zahlen' : ''}${hasSymbol ? ', Sonderzeichen' : ''}`
        ).setColor(strengthColor);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
} satisfies Command;