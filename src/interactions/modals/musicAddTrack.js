import { buildPanel, getVoteRequired } from '../../utils/musicPanel.js';

const skipPattern = /remaster(?:ed)?|\blive\b|\bremix\b|\bkaraoke\b|\btribute\b|\bcover\b/i;

function isPreview(track) {
    try { return Buffer.from(track.encoded, 'base64').includes('/preview/'); } catch { return false; }
}

export default {
    name: 'music_addtrack_modal',
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const query = interaction.fields.getTextInputValue('music_track_query');
        const client = interaction.client;
        const player = client.lavalink?.getPlayer(interaction.guildId);

        if (!player) {
            return interaction.editReply({ content: '❌ No active music session.' });
        }

        const result = await player.search({ query }, interaction.user);

        if (!result.tracks.length || result.loadType === 'empty') {
            return interaction.editReply({ content: `❌ No results found for: \`${query}\`` });
        }
        if (result.loadType === 'error') {
            return interaction.editReply({ content: '❌ Search failed. Try a different query.' });
        }

        const track = result.tracks.find(t => !skipPattern.test(t.info.title) && !isPreview(t))
            ?? result.tracks.find(t => !isPreview(t))
            ?? result.tracks[0];
        await player.queue.add(track);

        const wasEmpty = !player.queue.current;
        if (wasEmpty) {
            await player.connect();
            await player.play({ paused: false });
        }

        return interaction.editReply({
            content: `✅ Added: **${track.info.title}** by ${track.info.author}${wasEmpty ? ' — starting now!' : ''}`,
        });
    },
};
