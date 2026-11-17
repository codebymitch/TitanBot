import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const target = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;

        if (target.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bot tidak punya streak.'
            });
        }

        const streak = await StreakService.getUserStreak(client, guildId, target.id);

        if (!streak || streak.currentCount === 0) {
            const embed = infoEmbed(
                'Belum Ada Streak',
                target.id === interaction.user.id
                    ? 'Kamu belum punya streak aktif. Kirim pesan hari ini untuk mulai streak!'
                    : `${target} belum punya streak aktif.`
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const current = streak.currentCount;
        const best = streak.best;

        const embed = createEmbed({
            title: `Streak ${target.displayName || target.username}`,
            description: streak.active ? 'Streak masih berjalan 🔥' : 'Streak terputus 💔',
            color: streak.active ? 'success' : 'warning',
            fields: [
                { name: 'Current', value: `${current} hari`, inline: true },
                { name: 'Best', value: `${best} hari`, inline: true },
                { name: 'Total Hari Aktif', value: `${streak.totalDays} hari`, inline: true },
                { name: 'Status', value: streak.active ? 'Active' : 'Broken', inline: true }
            ]
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
