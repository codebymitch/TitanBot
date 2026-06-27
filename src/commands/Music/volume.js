import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume')
        .addIntegerOption(opt =>
            opt.setName('level')
                .setDescription('Volume level (1–100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

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

        const level = interaction.options.getInteger('level', true);
        queue.node.setVolume(level);

        const emoji = level <= 30 ? '🔈' : level <= 70 ? '🔉' : '🔊';

        await interaction.reply({
            embeds: [successEmbed(`${emoji} Volume`, `Volume set to **${level}%**.`)],
        });
    },
};
