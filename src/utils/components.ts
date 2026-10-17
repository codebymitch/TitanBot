// components.js

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import type { APISelectMenuOption, SelectMenuComponentOptionData, StringSelectMenuOptionBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';

export function getConfirmationButtons(customIdPrefix: string = 'confirm'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_yes`)
            .setLabel('Bestätigen')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(`${customIdPrefix}_no`)
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
}

export function getPaginationRow(customIdPrefix: string = 'page', currentPage: number = 1, totalPages: number = 1): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
            .setLabel(`Seite ${currentPage} von ${totalPages}`)
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

export type SelectMenuOptionInput = StringSelectMenuOptionBuilder | SelectMenuComponentOptionData | APISelectMenuOption;

export function createSelectMenu(
    customId: string,
    placeholder: string,
    options: SelectMenuOptionInput[] = [],
    min: number = 1,
    max: number = 1,
): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .setMinValues(min)
            .setMaxValues(max)
            .addOptions(options)
    );
}

export function createButton(customId: string, label: string, style: string = 'primary', emoji: string | null = null, disabled: boolean = false): ButtonBuilder {
    
    if (!customId || typeof customId !== 'string' || customId.length === 0) {
        throw new Error('customId must be a non-empty string');
    }
    if (!label || typeof label !== 'string' || label.length === 0) {
        throw new Error('label must be a non-empty string');
    }

    const validCustomId = customId.substring(0, 100);
    const validLabel = label.substring(0, 80);

    const normalizedStyle = style.charAt(0).toUpperCase() + style.slice(1).toLowerCase();
    const buttonStyle = ButtonStyle[normalizedStyle as keyof typeof ButtonStyle] || ButtonStyle.Primary;
    
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

export function createLinkButton(label: string, url: string, emoji: string | null = null): ButtonBuilder {
    
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

export interface ButtonRowItem {
    customId?: string;
    label: string;
    url?: string;
    style?: string;
    emoji?: string | null;
    disabled?: boolean;
}

export function createButtonRow(buttons: (ButtonRowItem | null | undefined)[]): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
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
                    button.customId!,
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