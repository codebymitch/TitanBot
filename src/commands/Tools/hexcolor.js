import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Tools/hexcolor.js
export default {
    data: new SlashCommandBuilder()
        .setName('hexcolor')
        .setDescription('Generate a random hex color with preview')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Specific hex color (e.g., #FF5733 or FF5733)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            let hexColor = interaction.options.getString('color');
            let isRandom = false;
            
            // If no color provided, generate a random one
            if (!hexColor) {
                isRandom = true;
                hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            } else {
                // Clean and validate the provided color
                hexColor = hexColor.replace('#', '');
                if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                    return interaction.editReply({
                        embeds: [errorEmbed('Error', 'Please provide a valid hex color code (e.g., #FF5733 or FF5733)')],
                        flags: ["Ephemeral"]
                    });
                }
                
                // Convert 3-digit hex to 6-digit
                if (hexColor.length === 3) {
                    hexColor = hexColor.split('').map(c => c + c).join('');
                }
                
                hexColor = '#' + hexColor.toUpperCase();
            }
            
            // Convert hex to RGB
            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);
            
            // Calculate brightness (for text color)
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            const textColor = brightness > 128 ? '#000000' : '#FFFFFF';
            
            // Create a color preview image URL
            const colorPreviewUrl = `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;
            
            // Get color name if possible (using a simple mapping)
            const colorName = getColorName(hexColor);
            
            // Create the embed
            const embed = successEmbed(
                '🎨 Color Information',
                `**Hex:** \`${hexColor}\`\n` +
                `**RGB:** \`rgb(${r}, ${g}, ${b})\`\n` +
                `**HSL:** \`${rgbToHsl(r, g, b)}\`\n` +
                `**Name:** ${colorName || 'Custom Color'}`
            )
            .setColor(hexColor)
            .setImage(colorPreviewUrl);
            
            if (isRandom) {
                embed.setFooter({ text: '✨ Randomly generated color' });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Hexcolor command error:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Failed to process the color. Please try again.')],
                flags: ["Ephemeral"]
            });
        }
    },
};

// Helper function to convert RGB to HSL
function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

// Simple color name mapping
function getColorName(hex) {
    const colors = {
        '#FF0000': 'Red',
        '#00FF00': 'Green',
        '#0000FF': 'Blue',
        '#FFFF00': 'Yellow',
        '#FF00FF': 'Magenta',
        '#00FFFF': 'Cyan',
        '#000000': 'Black',
        '#FFFFFF': 'White',
        '#808080': 'Gray',
        '#FFA500': 'Orange',
        '#800080': 'Purple',
        '#A52A2A': 'Brown',
        '#FFC0CB': 'Pink',
        '#008000': 'Dark Green',
        '#000080': 'Navy',
        '#FFD700': 'Gold',
        '#C0C0C0': 'Silver',
        '#FF6347': 'Tomato',
        '#40E0D0': 'Turquoise',
        '#E6E6FA': 'Lavender'
    };
    
    // If exact match found
    if (colors[hex.toUpperCase()]) {
        return colors[hex.toUpperCase()];
    }
    
    // Try to find the closest color
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
    
    return minDistance < 1000000 ? `Close to ${closestColor}` : null;
}
