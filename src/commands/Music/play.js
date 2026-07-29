import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setNameLocalizations({ ko: '재생' })
        .setDescription('Play a song or add it to the queue')
        .setDescriptionLocalizations({ ko: '노래를 재생하거나 대기열에 추가' })
        .addStringOption((opt) =>
            opt.setName('query')
               .setNameLocalizations({ ko: '검색어' })
               .setDescription('Song name or URL')
               .setDescriptionLocalizations({ ko: '노래 제목 또는 URL' })
               .setRequired(true),
        ),

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const result = await playQuery(client, interaction, interaction.options.getString('query'));
        await replyMusicSuccess(interaction, result.embed);
    },
};
