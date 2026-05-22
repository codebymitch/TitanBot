import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and disconnect the bot'),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('The bot is not in a voice channel.')],
            });
        }

        await player.destroy();

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '⏹️ Stopped',
                description: 'Music stopped and queue cleared.',
                color: 'blurple',
            })],
        });
    },
};
