import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildQueueReply } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue (Spotify, YouTube, and all sources)')
        .addIntegerOption((opt) =>
            opt
                .setName('page')
                .setDescription('Page number')
                .setMinValue(1),
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

        const pageNumber = interaction.options.getInteger('page') ?? 1;
        const pageIndex = Math.max(0, pageNumber - 1);

        const payload = await buildQueueReply(client, interaction.guildId, pageIndex);

        if (!payload) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'لا توجد قائمة تشغيل نشطة حالياً.',
            });
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: payload.embeds ?? [],
            components: payload.components ?? [],
        });
    },
};
