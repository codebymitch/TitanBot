import { buildPanel, getVoteRequired, fmtDuration } from '../../utils/musicPanel.js';

function parseTimestamp(raw) {
    const parts = raw.split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return parts[0] * 1000;
}

export default {
    name: 'music_seek_modal',
    async execute(interaction) {
        const raw = interaction.fields.getTextInputValue('music_seek_value').trim();
        let ms = parseTimestamp(raw);

        if (isNaN(ms) || ms < 0) {
            return interaction.reply({ content: '❌ Invalid timestamp. Use `1:30` or `90`.', ephemeral: true });
        }

        const client = interaction.client;
        const player = client.lavalink?.getPlayer(interaction.guildId);
        if (!player?.queue.current) return interaction.reply({ content: '❌ No active music session.', ephemeral: true });

        const dur = player.queue.current.info.duration;
        if (ms > dur) ms = dur;

        await player.seek(ms);

        const panel = client.musicPanels?.get(interaction.guildId);
        if (panel) {
            const votes = client.musicVotes?.get(interaction.guildId)?.size ?? 0;
            const required = getVoteRequired(player, client);
            const isPaused = panel.isPaused ?? player.paused;
            const channel = client.channels.cache.get(panel.textChannelId);
            const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
            if (message) await message.edit(buildPanel(player, votes, required, isPaused, panel.activeFilter ?? null)).catch(() => {});
        }

        return interaction.reply({ content: `⏩ Seeked to **${fmtDuration(ms)}**`, ephemeral: true });
    },
};
