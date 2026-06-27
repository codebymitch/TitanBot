import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('Disconnect the bot from voice (clears queue)'),

    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue) {
            // Bot might be in VC without a queue — force disconnect
            const botMember = interaction.guild.members.me;
            if (botMember?.voice?.channel) {
                botMember.voice.disconnect();
                return interaction.reply({ embeds: [successEmbed('👋 Disconnected', 'Left the voice channel.')] });
            }
            return interaction.reply({
                embeds: [createEmbed({ title: '❌ Not Connected', description: "I'm not in a voice channel.", color: 'error' })],
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
            embeds: [successEmbed('👋 Disconnected', 'Left the voice channel and cleared the queue.')],
        });
    },
};
