import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from './embeds.js';

const PANEL_ROWS = [
    [
        { id: 'lock', label: '🔒 Lock', style: ButtonStyle.Secondary },
        { id: 'unlock', label: '🔓 Unlock', style: ButtonStyle.Secondary },
        { id: 'hide', label: '🙈 Hide', style: ButtonStyle.Secondary },
        { id: 'show', label: '👁️ Show', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'name', label: '✏️ Name', style: ButtonStyle.Primary },
        { id: 'limit', label: '👥 Limit', style: ButtonStyle.Primary },
        { id: 'bitrate', label: '🎵 Bitrate', style: ButtonStyle.Primary },
        { id: 'info', label: 'ℹ️ Info', style: ButtonStyle.Primary },
    ],
    [
        { id: 'trust', label: '✅ Trust', style: ButtonStyle.Success },
        { id: 'invite', label: '📨 Invite', style: ButtonStyle.Success },
        { id: 'block', label: '🚫 Block', style: ButtonStyle.Danger },
        { id: 'unblock', label: '♻️ Unblock', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'kick', label: '👢 Kick', style: ButtonStyle.Danger },
        { id: 'claim', label: '👑 Claim', style: ButtonStyle.Primary },
        { id: 'transfer', label: '🔁 Transfer', style: ButtonStyle.Primary },
        { id: 'chat', label: '💬 Chat', style: ButtonStyle.Secondary },
    ],
    [
        { id: 'reset', label: '🔄 Reset', style: ButtonStyle.Secondary },
        { id: 'delete', label: '🗑️ Delete', style: ButtonStyle.Danger },
    ],
];

/**
 * Build the public control panel message for temporary voice channels.
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[] }}
 */
export function createJoinToCreatePanel() {
    const embed = createEmbed({
        title: 'TempVoice Interface',
        description:
            'Antarmuka ini dapat digunakan untuk mengatur voice channel sementara kamu.\n\n' +
            '**NAMA** · **BATAS** · **PRIVASI** · **SEMBUNYIKAN / TAMPILKAN** · **CHAT**\n' +
            '**PERCAYAI** · **UNDANG** · **BLOKIR / BUKA BLOKIR** · **USIR**\n' +
            '**AMBIL** · **SERAHKAN** · **BITRATE** · **INFO** · **RESET** · **HAPUS**\n\n' +
            'Antarmuka ini dapat digunakan dengan mengklik tombol di bawah ini.',
        color: 'info',
        footer: 'Kontrol pengelolaan hanya dapat digunakan oleh pemilik room sementara.',
    });

    const components = PANEL_ROWS.map((row) =>
        new ActionRowBuilder().addComponents(
            row.map((button) =>
                new ButtonBuilder()
                    .setCustomId(`jtc-control:${button.id}`)
                    .setLabel(button.label)
                    .setStyle(button.style)
            )
        )
    );

    return { embeds: [embed], components };
}

export default createJoinToCreatePanel;
