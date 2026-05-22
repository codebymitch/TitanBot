import { buildPanel, getVoteRequired } from '../../utils/musicPanel.js';

export default {
    name: 'music_volume_modal',
    async execute(interaction) {
        const raw = interaction.fields.getTextInputValue('music_volume_value');
        const vol = parseInt(raw, 10);

        if (isNaN(vol) || vol < 0 || vol > 200) {
            return interaction.reply({ content: '❌ Volume must be between 0 and 200.', ephemeral: true });
        }

        const client = interaction.client;
        const player = client.lavalink?.getPlayer(interaction.guildId);
        if (!player?.queue.current) return interaction.reply({ content: '❌ No active music session.', ephemeral: true });

        await player.setVolume(vol);

        const panel = client.musicPanels?.get(interaction.guildId);
        const votes = client.musicVotes?.get(interaction.guildId)?.size ?? 0;
        const required = getVoteRequired(player, client);
        const isPaused = panel?.isPaused ?? player.paused;
        const activeFilter = panel?.activeFilter ?? null;

        if (panel) {
            const channel = client.channels.cache.get(panel.textChannelId);
            const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
            if (message) await message.edit(buildPanel(player, votes, required, isPaused, activeFilter)).catch(() => {});
        }

        return interaction.reply({ content: `🔊 Volume set to **${vol}%**`, ephemeral: true });
    },
};
