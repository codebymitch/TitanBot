import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track (Spotify, YouTube, and all sources)'),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (deferred === false) {
            return;
        }

        const guildId = interaction.guildId ?? interaction.guild?.id;
        if (!guildId) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'هذا الأمر يعمل داخل السيرفرات فقط.',
            });
            return;
        }

        const payload = await buildNowPlayingReply(client, guildId);

        if (!payload) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'لا يوجد مقطع يعمل حالياً.',
            });
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: payload.embeds ?? [],
            components: payload.components ?? [],
        });
    },
};
