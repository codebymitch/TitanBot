import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { joinVoiceChannel, replyMusicSuccess, replyMusicError } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel without starting playback'),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (!deferred) {
            return;
        }

        const guildId = interaction.guildId ?? interaction.guild?.id;
        if (!guildId) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'هذا الأمر يعمل داخل السيرفرات فقط.',
            });
            return;
        }

        try {
            const result = await joinVoiceChannel(client, interaction);

            if (!result) {
                await replyMusicError(interaction, 'تعذر الانضمام إلى القناة الصوتية.');
                return;
            }

            if (typeof result === 'object' && 'ok' in result) {
                if (!result.ok) {
                    await replyMusicError(interaction, result.message ?? 'تعذر الانضمام إلى القناة الصوتية.');
                    return;
                }
                await replyMusicSuccess(interaction, result.embed);
                return;
            }

            await replyMusicSuccess(interaction, result);
        } catch (error) {
            console.error('[JOIN COMMAND ERROR]:', error);
            await replyMusicError(interaction, 'حدث خطأ أثناء محاولة الانضمام إلى القناة الصوتية.');
        }
    },
};
