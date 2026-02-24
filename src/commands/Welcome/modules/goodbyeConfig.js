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

export const GOODBYE_CONFIG_BUTTON_ID = 'goodbye_config';
export const GOODBYE_CONFIG_MODAL_ID = 'goodbye_config_modal';
export const GOODBYE_CONFIG_ACTIONS = ['channel', 'message', 'ping', 'image'];

export function hasGoodbyeSetup(config) {
    return Boolean(config?.goodbyeChannelId);
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

export function buildGoodbyeConfigPayload(guild, config, notice = null) {
    const previewMessage = formatWelcomeMessage(config.leaveMessage || '{user.tag} has left the server.', {
        user: guild?.members?.me?.user || guild?.client?.user,
        guild
    });

    const imageValue =
        typeof config?.leaveEmbed?.image === 'string'
            ? config.leaveEmbed.image
            : config?.leaveEmbed?.image?.url || null;

    const embed = new EmbedBuilder()
        .setColor(getColor('primary'))
        .setTitle('⚙️ Goodbye Configuration')
        .setDescription(notice || 'Customize your goodbye setup using the buttons below.')
        .addFields(
            {
                name: 'Channel',
                value: config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : 'Not set',
                inline: true
            },
            {
                name: 'Ping User',
                value: config.goodbyePing ? '✅ Yes' : '❌ No',
                inline: true
            },
            {
                name: 'Status',
                value: config.goodbyeEnabled ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: 'Message Preview',
                value: truncatePreview(previewMessage, 1024)
            },
            {
                name: 'Image URL',
                value: imageValue ? truncatePreview(imageValue, 1024) : 'Not set'
            }
        )
        .setFooter({ text: 'Buttons update your saved goodbye setup immediately.' });

    if (imageValue) {
        embed.setImage(imageValue);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${GOODBYE_CONFIG_BUTTON_ID}:channel`)
            .setLabel('Channel')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`${GOODBYE_CONFIG_BUTTON_ID}:message`)
            .setLabel('Message')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`${GOODBYE_CONFIG_BUTTON_ID}:ping`)
            .setLabel('Toggle Ping')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`${GOODBYE_CONFIG_BUTTON_ID}:image`)
            .setLabel('Image')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

export function buildGoodbyeConfigModal(action, config) {
    if (!GOODBYE_CONFIG_ACTIONS.includes(action) || action === 'ping') {
        return null;
    }

    const modal = new ModalBuilder().setCustomId(`${GOODBYE_CONFIG_MODAL_ID}:${action}`);

    if (action === 'channel') {
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Channel mention or ID')
            .setPlaceholder('Example: #goodbye or 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(config.goodbyeChannelId ? `<#${config.goodbyeChannelId}>` : '');

        modal
            .setTitle('Set Goodbye Channel')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    if (action === 'message') {
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Goodbye message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000)
            .setValue(config.leaveMessage || '{user.tag} has left the server.');

        modal
            .setTitle('Set Goodbye Message')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    if (action === 'image') {
        const imageValue =
            typeof config?.leaveEmbed?.image === 'string'
                ? config.leaveEmbed.image
                : config?.leaveEmbed?.image?.url || '';

        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Image URL (leave blank to remove)')
            .setPlaceholder('https://example.com/goodbye.png')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(imageValue);

        modal
            .setTitle('Set Goodbye Image')
            .addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    return null;
}