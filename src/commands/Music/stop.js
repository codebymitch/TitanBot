import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and disconnect the bot from voice'),

    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue) {
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

        queue.delete();

        await interaction.reply({
            embeds: [successEmbed('⏹️ Stopped', 'Playback stopped and queue cleared.')],
        });
    },
};
