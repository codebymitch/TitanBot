import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { formatWelcomeMessage } from '../../../utils/welcome.js';

export const WELCOME_CONFIG_BUTTON_ID = 'welcome_config';
export const WELCOME_CONFIG_MODAL_ID = 'welcome_config_modal';
export const WELCOME_CONFIG_ACTIONS = ['channel', 'message', 'ping', 'image'];

export function hasWelcomeSetup(config) {
    return Boolean(config?.channelId);
}

export function parseChannelInput(rawInput) {
    const value = String(rawInput || '').trim();
    if (!value) return null;

    const mentionMatch = value.match(/^<#(\d+)>$/);
    if (mentionMatch) return mentionMatch[1];

    if (/^\d{17,20}$/.test(value)) {
        return value;
    }

    return null;
}

export function isValidImageUrl(rawInput) {
    const value = String(rawInput || '').trim();
    if (!value) return true;

    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

function truncatePreview(value, maxLength = 512) {
    if (!value) return 'Not set';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

export function buildWelcomeConfigPayload(guild, config, notice = null) {
    const previewMessage = formatWelcomeMessage(config.welcomeMessage || 'Welcome {user} to {server}!', {
        user: guild?.members?.me?.user || guild?.client?.user,
        guild
    });

    const embed = new EmbedBuilder()
        .setColor(getColor('primary'))
        .setTitle('⚙️ Welcome Configuration')
        .setDescription(notice || 'Customize your welcome setup using the buttons below.')
        .addFields(
            {
                name: 'Channel',
                value: config.channelId ? `<#${config.channelId}>` : 'Not set',
                inline: true
            },
            {
                name: 'Ping User',
                value: config.welcomePing ? '✅ Yes' : '❌ No',
                inline: true
            },
            {
                name: 'Status',
                value: config.enabled ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: 'Message Preview',
                value: truncatePreview(previewMessage, 1024)
            },
            {
                name: 'Image URL',
                value: config.welcomeImage ? truncatePreview(config.welcomeImage, 1024) : 'Not set'
            }
        )
        .setFooter({ text: 'Buttons update your saved welcome setup immediately.' });

    if (config.welcomeImage) {
        embed.setImage(config.welcomeImage);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WELCOME_CONFIG_BUTTON_ID}:channel`)
            .setLabel('Channel')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`${WELCOME_CONFIG_BUTTON_ID}:message`)
            .setLabel('Message')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`${WELCOME_CONFIG_BUTTON_ID}:ping`)
            .setLabel('Toggle Ping')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`${WELCOME_CONFIG_BUTTON_ID}:image`)
            .setLabel('Image')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

export function buildWelcomeConfigModal(action, config) {
    if (!WELCOME_CONFIG_ACTIONS.includes(action) || action === 'ping') {
        return null;
    }

    const modal = new ModalBuilder().setCustomId(`${WELCOME_CONFIG_MODAL_ID}:${action}`);

    if (action === 'channel') {
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Channel mention or ID')
            .setPlaceholder('Example: #welcome or 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(config.channelId ? `<#${config.channelId}>` : '');

        modal
            .setTitle('Set Welcome Channel')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    if (action === 'message') {
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Welcome message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000)
            .setValue(config.welcomeMessage || 'Welcome {user} to {server}!');

        modal
            .setTitle('Set Welcome Message')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    if (action === 'image') {
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Image URL (leave blank to remove)')
            .setPlaceholder('https://example.com/welcome.png')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(config.welcomeImage || '');

        modal
            .setTitle('Set Welcome Image')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    return null;
}