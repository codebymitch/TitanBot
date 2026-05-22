import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause or resume the current track'),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player?.queue.current) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Nothing is playing right now.')],
            });
        }

        await player.pause(!player.paused);
        const isPaused = player.paused;

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: isPaused ? '⏸️ Paused' : '▶️ Resumed',
                description: `**[${player.queue.current.info.title}](${player.queue.current.info.uri})**`,
                color: 'blurple',
            })],
        });
    },
};
