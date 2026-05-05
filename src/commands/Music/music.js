import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getPlayer } from '../../services/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Control music playback')
        .addSubcommand(s => s.setName('stop').setDescription('Stop playback and leave the voice channel'))
        .addSubcommand(s => s.setName('skip').setDescription('Skip the current song'))
        .addSubcommand(s => s.setName('queue').setDescription('Show the current music queue'))
        .addSubcommand(s => s.setName('pause').setDescription('Pause the current song'))
        .addSubcommand(s => s.setName('resume').setDescription('Resume the paused song')),

    category: 'Music',

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const player = getPlayer(interaction.guildId);

        if (sub === 'queue') {
            if (!player?.currentSong && !player?.songs.length) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Empty Queue', 'Nothing is playing or queued right now.')],
                    ephemeral: true,
                });
            }
            const lines = [];
            if (player.currentSong) {
                lines.push(`**▶️ Now Playing:** [${player.currentSong.title}](${player.currentSong.url}) \`${player.currentSong.durationFormatted}\``);
            }
            if (player.songs.length > 0) {
                lines.push('\n**Up Next:**');
                player.songs.slice(0, 10).forEach((s, i) => {
                    lines.push(`${i + 1}. [${s.title}](${s.url}) \`${s.durationFormatted}\``);
                });
                if (player.songs.length > 10) lines.push(`... and ${player.songs.length - 10} more`);
            }
            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({
                    title: '🎵 Music Queue',
                    description: lines.join('\n'),
                    color: 'primary',
                    footer: { text: `${player.songs.length} song(s) in queue` },
                })],
            });
        }

        if (!player) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Not Playing', 'The bot is not in a voice channel.')],
                ephemeral: true,
            });
        }

        if (sub === 'stop') {
            player.songs = [];
            player.destroy();
            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({ title: '⏹️ Stopped', description: 'Stopped playback and left the voice channel.', color: 'warning' })],
            });
        }

        if (sub === 'skip') {
            if (!player.currentSong) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Not Playing', 'Nothing is playing right now.')],
                    ephemeral: true,
                });
            }
            const title = player.currentSong.title;
            player.skip();
            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({ title: '⏭️ Skipped', description: `Skipped **${title}**`, color: 'primary' })],
            });
        }

        if (sub === 'pause') {
            if (!player.isPlaying) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Not Playing', 'Nothing is playing right now.')],
                    ephemeral: true,
                });
            }
            player.pause();
            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({ title: '⏸️ Paused', description: `Paused **${player.currentSong?.title}**`, color: 'warning' })],
            });
        }

        if (sub === 'resume') {
            if (!player.isPaused) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Not Paused', 'Nothing is paused right now.')],
                    ephemeral: true,
                });
            }
            player.resume();
            return InteractionHelper.safeReply(interaction, {
                embeds: [createEmbed({ title: '▶️ Resumed', description: `Resumed **${player.currentSong?.title}**`, color: 'success' })],
            });
        }
    },
};
