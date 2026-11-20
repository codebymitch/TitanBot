import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { createEmbed } from './embeds.js';

const CONTROL_IMAGE_PATH = fileURLToPath(new URL('../assets/jtc-control-reference.png', import.meta.url));
const CONTROL_IMAGE_NAME = 'jtc-control-reference.png';

const PANEL_ROWS = [
    [
        { id: 'lock', emoji: '🔒', style: ButtonStyle.Secondary },
        { id: 'unlock', emoji: '🔓', style: ButtonStyle.Secondary },
        { id: 'hide', emoji: '🙈', style: ButtonStyle.Secondary },
        { id: 'show', emoji: '👁️', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'name', emoji: '✏️', style: ButtonStyle.Secondary },
        { id: 'limit', emoji: '👥', style: ButtonStyle.Secondary },
        { id: 'bitrate', emoji: '🎵', style: ButtonStyle.Secondary },
        { id: 'info', emoji: 'ℹ️', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'trust', emoji: '✅', style: ButtonStyle.Secondary },
        { id: 'invite', emoji: '📨', style: ButtonStyle.Secondary },
        { id: 'block', emoji: '🚫', style: ButtonStyle.Secondary },
        { id: 'unblock', emoji: '♻️', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'kick', emoji: '👢', style: ButtonStyle.Secondary },
        { id: 'claim', emoji: '👑', style: ButtonStyle.Secondary },
        { id: 'transfer', emoji: '🔁', style: ButtonStyle.Secondary },
        { id: 'chat', emoji: '💬', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'reset', emoji: '🔄', style: ButtonStyle.Secondary },
        { id: 'delete', emoji: '🗑️', style: ButtonStyle.Secondary },
    ],
];

/**
 * Build the public control panel message for temporary voice channels.
 * @param {string|null} imageUrl Custom image URL. Falls back to the bundled default image when empty.
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[], files?: import('discord.js').AttachmentBuilder[] }}
 */
export function createJoinToCreatePanel(imageUrl = null) {
    const customImage = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    const useCustomImage = customImage.length > 0;

    const embed = createEmbed({
        title: 'TempVoice Interface',
        description: 'Atur voice channel tempat kamu berada. Pemilik room atau moderator dapat mengganti nama, membatasi member, memindahkan user, dan mengunci room.',
        color: 'info',
        image: useCustomImage ? customImage : `attachment://${CONTROL_IMAGE_NAME}`,
        footer: 'Klaim, transfer, dan reset hanya tersedia untuk temporary room.',
    });

    const components = PANEL_ROWS.map((row) =>
        new ActionRowBuilder().addComponents(
            row.map((button) =>
                new ButtonBuilder()
                    .setCustomId(`jtc-control:${button.id}`)
                    .setEmoji(button.emoji)
                    .setStyle(button.style)
            )
        )
    );

    const payload = {
        embeds: [embed],
        components,
    };

    if (useCustomImage) {
        return payload;
    }

    return {
        ...payload,
        files: [new AttachmentBuilder(CONTROL_IMAGE_PATH, { name: CONTROL_IMAGE_NAME })],
    };
}

export default createJoinToCreatePanel;
