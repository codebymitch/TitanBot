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
                message: 'Bots don\'t have streaks.'
            });
        }

        const streak = await StreakService.getUserStreak(client, guildId, target.id);

        if (!streak || streak.currentCount === 0) {
            const embed = infoEmbed(
                'No Streak Yet',
                target.id === interaction.user.id
                    ? 'You don\'t have an active streak yet. Send a message today to start your streak!'
                    : `${target} doesn't have an active streak yet.`
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const current = streak.currentCount;
        const best = streak.best;

        const embed = createEmbed({
            title: `Streak ${target.displayName || target.username}`,
            description: streak.active ? 'Your streak is still going 🔥' : 'Your streak was broken 💔',
            color: streak.active ? 'success' : 'warning',
            fields: [
                { name: 'Current', value: `${current} days`, inline: true },
                { name: 'Best', value: `${best} days`, inline: true },
                { name: 'Total Active Days', value: `${streak.totalDays} days`, inline: true },
                { name: 'Status', value: streak.active ? 'Active' : 'Broken', inline: true }
            ]
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
