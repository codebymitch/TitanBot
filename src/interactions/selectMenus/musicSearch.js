import { buildPanel, getVoteRequired } from '../../utils/musicPanel.js';

export default {
    name: 'music_search_select',
    async execute(interaction) {
        await interaction.deferUpdate();

        const client = interaction.client;
        const key = `${interaction.guildId}:${interaction.user.id}`;
        const results = client.musicSearchResults?.get(key);

        if (!results) {
            return interaction.editReply({ content: '❌ Search expired — please try Add Track again.', components: [] });
        }

        client.musicSearchResults.delete(key);

        const track = results[parseInt(interaction.values[0])];
        const player = client.lavalink?.getPlayer(interaction.guildId);
        if (!player) return interaction.editReply({ content: '❌ No active music session.', components: [] });

        const wasEmpty = !player.queue.current;
        await player.queue.add(track);

        if (wasEmpty) {
            await player.connect();
            await player.play({ paused: false });
            // Give Lavalink 500ms to set queue.current, then update the panel
            setTimeout(async () => {
                const panel = client.musicPanels?.get(interaction.guildId);
                if (!panel || !player.queue.current) return;
                const required = getVoteRequired(player, client);
                const channel = client.channels.cache.get(panel.textChannelId);
                const msg = await channel?.messages.fetch(panel.messageId).catch(() => null);
                if (msg) await msg.edit(buildPanel(player, 0, required, false, panel.activeFilter)).catch(() => {});
            }, 500);
        }

        return interaction.editReply({
            content: `✅ Added **${track.info.title}** by ${track.info.author}${wasEmpty ? ' — starting now!' : ''}`,
            components: [],
        });
    },
};
