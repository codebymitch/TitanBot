import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';

export function getConfirmationButtons(customIdPrefix = 'confirm') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_yes`)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_no`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
}

export function getPaginationRow(customIdPrefix = 'page', currentPage = 1, totalPages = 1) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_first`)
            .setLabel('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_prev`)
            .setLabel('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_page`)
            .setLabel(`Page ${currentPage} of ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_next`)
            .setLabel('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_last`)
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages)
    );
}

export function createSelectMenu(customId, placeholder, options = [], min = 1, max = 1) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .setMinValues(min)
            .setMaxValues(max)
            .addOptions(options)
    );
}

export function createButton(customId, label, style = 'primary', emoji = null, disabled = false) {
    
    if (!customId || typeof customId !== 'string' || customId.length === 0) {
        throw new Error('customId must be a non-empty string');
    }
    if (!label || typeof label !== 'string' || label.length === 0) {
        throw new Error('label must be a non-empty string');
    }
    
    
    const validCustomId = customId.substring(0, 100);
    const validLabel = label.substring(0, 80);
    
    
    const normalizedStyle = style.charAt(0).toUpperCase() + style.slice(1).toLowerCase();
    const buttonStyle = ButtonStyle[normalizedStyle] || ButtonStyle.Primary;
    
    const button = new ButtonBuilder()
        .setCustomId(validCustomId)
        .setLabel(validLabel)
        .setStyle(buttonStyle)
        .setDisabled(disabled === true);
    
    if (emoji && typeof emoji === 'string' && emoji.length > 0) {
        try {
            button.setEmoji(emoji);
        } catch (error) {
            
        }
    }
    
    return button;
}

export function createLinkButton(label, url, emoji = null) {
    
    if (!label || typeof label !== 'string') {
        throw new Error('label must be a non-empty string');
    }
    if (!url || typeof url !== 'string') {
        throw new Error('url must be a non-empty string');
    }
    
    const validLabel = label.substring(0, 80);
    
    const button = new ButtonBuilder()
        .setLabel(validLabel)
        .setURL(url)
        .setStyle(ButtonStyle.Link);
    
    if (emoji && typeof emoji === 'string' && emoji.length > 0) {
        try {
            button.setEmoji(emoji);
        } catch (error) {
            
        }
    }
    
    return button;
}

export function createButtonRow(buttons) {
    const row = new ActionRowBuilder();
    
    if (!Array.isArray(buttons) || buttons.length === 0) {
        return row;
    }
    
    
    for (const button of buttons.slice(0, 5)) {
        if (!button) continue;
        
        try {
            if (button.url) {
                row.addComponents(createLinkButton(button.label, button.url, button.emoji));
            } else {
                row.addComponents(createButton(
                    button.customId,
                    button.label,
                    button.style || 'primary',
                    button.emoji,
                    button.disabled || false
                ));
            }
        } catch (error) {
            
            continue;
        }
    }
    
    return row;
}



