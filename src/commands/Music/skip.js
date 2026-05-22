import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player?.playing) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Nothing is playing right now.')],
            });
        }

        const skipped = player.queue.current;
        await player.skip();

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '⏭️ Skipped',
                description: skipped
                    ? `**[${skipped.info.title}](${skipped.info.uri})**`
                    : 'Track skipped.',
                color: 'blurple',
            })],
        });
    },
};
