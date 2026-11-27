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
                .setRequired(true)
                .setMinLength(1),
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
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) {
            return;
        }

        if (!interaction.guildId) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'هذا الأمر يعمل داخل السيرفرات فقط.',
            });
            return;
        }

        const query = interaction.options.getString('query', true).trim();
        const source = interaction.options.getString('source') ?? 'auto';

        if (!query) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'اكتب اسم الأغنية أو الرابط الأول.',
            });
            return;
        }

        try {
            const result = await playQuery(client, interaction, query, { source });

            if (result?.embed) {
                await replyMusicSuccess(interaction, result.embed);
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: result?.message ?? 'تعذر تشغيل المقطع المطلوب.',
            });
        } catch (error) {
            console.error('[PLAY COMMAND ERROR]:', error);
            await InteractionHelper.safeEditReply(interaction, {
                content: 'حدث خطأ غير متوقع أثناء محاولة تشغيل المقطع.',
            });
        }
    },
};
