import { EmbedBuilder } from 'discord.js';
import { getPlayer, buildNowPlayingEmbed, buildPlayerRow } from '../../services/musicPlayer.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function noPlayerReply(interaction) {
    return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Not Playing', 'Nothing is playing right now.')],
        ephemeral: true,
    });
}

export default [
    {
        name: 'music-pause',
        async execute(interaction) {
            const player = getPlayer(interaction.guildId);
            if (!player?.currentSong) return noPlayerReply(interaction);

            if (player.isPlaying) {
                player.pause();
            } else if (player.isPaused) {
                player.resume();
            }

            const isPaused = player.isPaused;
            await interaction.update({
                embeds: [buildNowPlayingEmbed(player.currentSong, isPaused)],
                components: [buildPlayerRow(isPaused)],
            });
        },
    },
    {
        name: 'music-skip',
        async execute(interaction) {
            const player = getPlayer(interaction.guildId);
            if (!player?.currentSong) return noPlayerReply(interaction);

            const skipped = player.currentSong.title;
            player.skip();

            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setColor(0x5C5C5C)
                    .setDescription(`⏭️ Skipped **${skipped}**`)
                    .setTimestamp()],
                components: [],
            });
        },
    },
    {
        name: 'music-stop',
        async execute(interaction) {
            const player = getPlayer(interaction.guildId);
            if (!player) return noPlayerReply(interaction);

            player.songs = [];
            player.playerMessage = null;
            player.destroy();

            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setColor(0x5C5C5C)
                    .setTitle('⏹️ Stopped')
                    .setDescription('Stopped playback and left the voice channel.')
                    .setTimestamp()],
                components: [],
            });
        },
    },
    {
        name: 'music-shuffle',
        async execute(interaction) {
            const player = getPlayer(interaction.guildId);
            if (!player?.currentSong) return noPlayerReply(interaction);

            if (player.songs.length < 2) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Nothing to Shuffle', 'Need at least 2 songs in the queue to shuffle.')],
                    ephemeral: true,
                });
            }

            player.shuffle();

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setDescription(`🔀 Queue shuffled! (${player.songs.length} songs)`)
                    .setTimestamp()],
                ephemeral: true,
            });
        },
    },
];
