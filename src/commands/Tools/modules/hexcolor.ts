import { SlashCommandBuilder, MessageFlags, type HexColorString } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName('hexcolor')
        .setDescription('Erzeugt eine zufällige Hex-Farbe mit Vorschau')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Bestimmte Hex-Farbe (z. B. #FF5733 oder FF5733)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                let hexColor = interaction.options.getString('color');
                let isRandom = false;

                if (!hexColor) {
                    isRandom = true;
                    hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                } else {
                    hexColor = hexColor.replace('#', '');
                    if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib einen gültigen Hex-Code an.\n\n**Gültige Formate:**\n• `#FF5733` (mit Raute)\n• `FF5733` (ohne Raute)\n• `F57` (3-stellige Kurzform)\n\n**Ungültig:** `#GG5733` (G ist keine Hex-Ziffer)' });
                    }

                    if (hexColor.length === 3) {
                        hexColor = hexColor.split('').map(c => c + c).join('');
                    }

                    hexColor = '#' + hexColor.toUpperCase();
                }

                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

                const colorPreviewUrl = `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;

                const colorName = getColorName(hexColor);

                const embed = successEmbed(
                    '🎨 Farbinfo',
                    `**Hex:** \`${hexColor}\`\n` +
                    `**RGB:** \`rgb(${r}, ${g}, ${b})\`\n` +
                    `**HSL:** \`${rgbToHsl(r, g, b)}\`\n` +
                    `**Name:** ${colorName || 'Eigene Farbe'}`
                )
                    .setColor(hexColor as HexColorString)
                    .setImage(colorPreviewUrl);

                if (isRandom) {
                    embed.setFooter({ text: 'Zufällig erzeugte Farbe' });
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Die Farbinfo konnte nicht erzeugt werden. Versuch es noch mal.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
} satisfies Command;

function rgbToHsl(r: number, g: number, b: number): string {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h: number | undefined, s: number, l = (max + min) / 2;

    if (max === min) {
h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h! /= 6;
    }

    return `hsl(${Math.round(h! * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getColorName(hex: string): string | null {
    const colors: Record<string, string> = {
        '#FF0000': 'Rot',
        '#00FF00': 'Grün',
        '#0000FF': 'Blau',
        '#FFFF00': 'Gelb',
        '#FF00FF': 'Magenta',
        '#00FFFF': 'Cyan',
        '#000000': 'Schwarz',
        '#FFFFFF': 'Weiß',
        '#808080': 'Grau',
        '#FFA500': 'Orange',
        '#800080': 'Lila',
        '#A52A2A': 'Braun',
        '#FFC0CB': 'Rosa',
        '#008000': 'Dunkelgrün',
        '#000080': 'Marineblau',
        '#FFD700': 'Gold',
        '#C0C0C0': 'Silber',
        '#FF6347': 'Tomatenrot',
        '#40E0D0': 'Türkis',
        '#E6E6FA': 'Lavendel'
    };
    
    if (colors[hex.toUpperCase()]) {
        return colors[hex.toUpperCase()];
    }
    
    const hexValue = parseInt(hex.replace('#', ''), 16);
    let closestColor = '';
    let minDistance = Infinity;
    
    for (const [colorHex, name] of Object.entries(colors)) {
        const colorValue = parseInt(colorHex.replace('#', ''), 16);
        const distance = Math.abs(hexValue - colorValue);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    
    return minDistance < 1000000 ? `Ähnlich wie ${closestColor}` : null;
}