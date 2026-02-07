import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';

export function getPromoRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Invite Me')
            .setURL('https://discord.com/oauth2/authorize?client_id=YOUR_BOT_ID&scope=bot&permissions=8')
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('Support Server')
            .setURL('https://discord.gg/YOUR_SERVER_INVITE')
            .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
            .setLabel('GitHub')
            .setURL('https://github.com/yourusername/your-bot')
            .setStyle(ButtonStyle.Link)
    );
}

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
    const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(ButtonStyle[style.charAt(0).toUpperCase() + style.slice(1).toLowerCase()] || ButtonStyle.Primary)
        .setDisabled(disabled);
    
    if (emoji) {
        button.setEmoji(emoji);
    }
    
    return button;
}

export function createLinkButton(label, url, emoji = null) {
    const button = new ButtonBuilder()
        .setLabel(label)
        .setURL(url)
        .setStyle(ButtonStyle.Link);
    
    if (emoji) {
        button.setEmoji(emoji);
    }
    
    return button;
}

export function createButtonRow(buttons) {
    const row = new ActionRowBuilder();
    
    for (const button of buttons) {
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
    }
    
    return row;
}
