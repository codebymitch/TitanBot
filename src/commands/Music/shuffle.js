import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the tracks in the queue'),

    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue?.isPlaying()) {
            return interaction.reply({
                embeds: [createEmbed({ title: '❌ Nothing Playing', description: 'There is nothing currently playing.', color: 'error' })],
                ephemeral: true,
            });
        }

        if (!interaction.member?.voice?.channelId || interaction.member.voice.channelId !== queue.channel?.id) {
            return interaction.reply({
                embeds: [createEmbed({ title: '❌ Wrong Channel', description: 'You need to be in the same voice channel as the bot.', color: 'error' })],
                ephemeral: true,
            });
        }

        if (queue.tracks.size < 2) {
            return interaction.reply({
                embeds: [createEmbed({ title: '🔀 Not Enough Tracks', description: 'Need at least 2 tracks in the queue to shuffle.', color: 'warning' })],
                ephemeral: true,
            });
        }

        queue.tracks.shuffle();

        await interaction.reply({
            embeds: [successEmbed('🔀 Shuffled', `Shuffled **${queue.tracks.size}** tracks in the queue.`)],
        });
    },
};
