import { SlashCommandBuilder } from 'discord.js';
import { useQueue, QueueRepeatMode } from 'discord-player';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

const MODES = {
    off:      { value: QueueRepeatMode.OFF,      label: 'Off',        emoji: '➡️' },
    track:    { value: QueueRepeatMode.TRACK,    label: 'Track',      emoji: '🔂' },
    queue:    { value: QueueRepeatMode.QUEUE,    label: 'Queue',      emoji: '🔁' },
    autoplay: { value: QueueRepeatMode.AUTOPLAY, label: 'Autoplay',   emoji: '♾️' },
};

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set the loop/repeat mode')
        .addStringOption(opt =>
            opt.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: '➡️ Off — play queue once',          value: 'off' },
                    { name: '🔂 Track — repeat current song',     value: 'track' },
                    { name: '🔁 Queue — repeat entire queue',     value: 'queue' },
                    { name: '♾️ Autoplay — auto-queue similar songs', value: 'autoplay' },
                )
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

        const modeKey = interaction.options.getString('mode', true);
        const mode = MODES[modeKey];

        queue.setRepeatMode(mode.value);

        await interaction.reply({
            embeds: [successEmbed(`${mode.emoji} Loop Mode`, `Repeat mode set to **${mode.label}**.`)],
        });
    },
};
