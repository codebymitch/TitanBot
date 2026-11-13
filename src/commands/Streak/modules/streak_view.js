import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const target = interaction.options.getUser('user');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (target.id === userId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Pick another member to view a streak with.'
            });
        }

        if (target.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bots cannot keep streaks.'
            });
        }

        const streak = await StreakService.getStreak(client, guildId, userId, target.id);
        const current = streak?.currentCount || 0;
        const best = streak?.best || 0;

        if (!streak || (current === 0 && best === 0)) {
            const embed = infoEmbed(
                'No Streak Yet',
                `You and ${target} do not have a streak. Start one with \`/streak send\` — you both need to send today.`
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const embed = createEmbed({
            title: 'Streak',
            description: `${interaction.user} & ${target}`,
            color: streak.active ? 'success' : 'warning',
            fields: [
                { name: 'Current', value: `${current} day${current === 1 ? '' : 's'}`, inline: true },
                { name: 'Best', value: `${best} day${best === 1 ? '' : 's'}`, inline: true },
                { name: 'Status', value: streak.active ? 'Active' : 'Broken', inline: true }
            ]
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
