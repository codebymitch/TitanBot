import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or playlist from Spotify, YouTube, or search by name')
        .addStringOption((opt) =>
            opt
                .setName('query')
                .setDescription('Song/playlist name or URL (Spotify, YouTube, etc.)')
                .setRequired(true),
        )
        .addStringOption((opt) =>
            opt
                .setName('source')
                .setDescription('Preferred search source when searching by name')
                .setRequired(false)
                .addChoices(
                    { name: 'Auto (Default)', value: 'auto' },
                    { name: 'Spotify', value: 'spotify' },
                    { name: 'YouTube', value: 'youtube' },
                ),
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const query = interaction.options.getString('query', true).trim();
        const source = interaction.options.getString('source') ?? 'auto';

        const result = await playQuery(client, interaction, query, { source });

        if (result?.embed) {
            await replyMusicSuccess(interaction, result.embed);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: result?.message ?? 'تعذر تشغيل المقطع المطلوب.',
        });
    },
};
