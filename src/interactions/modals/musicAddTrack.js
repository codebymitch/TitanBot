import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { buildPanel, getVoteRequired, fmtDuration } from '../../utils/musicPanel.js';

const skipPattern = /remaster(?:ed)?|\blive\b|\bremix\b|\bkaraoke\b|\btribute\b|\bcover\b/i;

function isPreview(track) {
    try { return Buffer.from(track.encoded, 'base64').includes('/preview/'); } catch { return false; }
}

export default {
    name: 'music_addtrack_modal',
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const rawQuery = interaction.fields.getTextInputValue('music_track_query');
        const client = interaction.client;
        const player = client.lavalink?.getPlayer(interaction.guildId);

        if (!player) return interaction.editReply({ content: '❌ No active music session.' });

        const isUrl = /^https?:\/\//i.test(rawQuery);
        const query = isUrl ? rawQuery : `scsearch:${rawQuery}`;


        const result = await player.search({ query }, interaction.user);

        if (!result.tracks.length || result.loadType === 'empty') {
            return interaction.editReply({ content: `❌ No results found for: \`${query}\`` });
        }
        if (result.loadType === 'error') {
            return interaction.editReply({ content: '❌ Search failed. Try a different query.' });
        }

        // Playlist — add all tracks directly, no picker needed
        if (result.loadType === 'playlist') {
            await player.queue.add(result.tracks);
            const wasEmpty = !player.queue.current;
            if (wasEmpty) {
                await player.connect();
                await player.play({ paused: false });
            }
            const playlistName = result.playlist?.name ?? 'Playlist';
            return interaction.editReply({
                content: `✅ Added **${result.tracks.length} tracks** from **${playlistName}** to the queue${wasEmpty ? ' — starting now!' : ''}`,
                components: [],
            });
        }

        // Filter non-preview, prefer no-skip-pattern tracks, take top 5
        const nonPreview = result.tracks.filter(t => !isPreview(t));
        const pool = nonPreview.length ? nonPreview : result.tracks;
        const options = pool.slice(0, 5);

        // Store results for the select menu handler (expires in 60s)
        const key = `${interaction.guildId}:${interaction.user.id}`;
        client.musicSearchResults.set(key, options);
        setTimeout(() => client.musicSearchResults.delete(key), 60_000);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('music_search_select')
            .setPlaceholder('Choose a track to add…')
            .addOptions(options.map((t, i) => ({
                label: t.info.title.slice(0, 100),
                description: `${t.info.author} • ${fmtDuration(t.info.duration)}`.slice(0, 100),
                value: String(i),
            })));

        return interaction.editReply({
            content: `🔍 **Results for "${query}"** — pick one:`,
            components: [new ActionRowBuilder().addComponents(menu)],
        });
    },
};
