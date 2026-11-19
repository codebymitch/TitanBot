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
        { id: 'name', emoji: '✏️', style: ButtonStyle.Primary },
        { id: 'limit', emoji: '👥', style: ButtonStyle.Primary },
        { id: 'bitrate', emoji: '🎵', style: ButtonStyle.Primary },
        { id: 'info', emoji: 'ℹ️', style: ButtonStyle.Primary },
    ],
    [
        { id: 'trust', emoji: '✅', style: ButtonStyle.Success },
        { id: 'invite', emoji: '📨', style: ButtonStyle.Success },
        { id: 'block', emoji: '🚫', style: ButtonStyle.Danger },
        { id: 'unblock', emoji: '♻️', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'kick', emoji: '👢', style: ButtonStyle.Danger },
        { id: 'claim', emoji: '👑', style: ButtonStyle.Primary },
        { id: 'transfer', emoji: '🔁', style: ButtonStyle.Primary },
        { id: 'chat', emoji: '💬', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'reset', emoji: '🔄', style: ButtonStyle.Secondary },
        { id: 'delete', emoji: '🗑️', style: ButtonStyle.Danger },
    ],
];

/**
 * Build the public control panel message for temporary voice channels.
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[] }}
 */
export function createJoinToCreatePanel() {
    const embed = createEmbed({
        title: 'TempVoice Interface',
        description: 'Atur voice channel kamu di sini. Ganti nama, limit member, pindahin user, atau kunci room sesuai kebutuhan.',
        color: 'info',
        image: `attachment://${CONTROL_IMAGE_NAME}`,
        footer: 'Klik tombol di bawah untuk mengatur temporary voice channel.',
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

    return {
        embeds: [embed],
        components,
        files: [new AttachmentBuilder(CONTROL_IMAGE_PATH, { name: CONTROL_IMAGE_NAME })],
    };
}

export default createJoinToCreatePanel;
