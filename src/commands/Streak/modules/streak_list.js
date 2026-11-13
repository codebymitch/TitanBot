import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const streaks = await StreakService.getUserStreaks(client, guildId, userId, { activeOnly: true });

        if (streaks.length === 0) {
            const embed = infoEmbed(
                'No Active Streaks',
                'You have no active streaks. Start one with `/streak send` and send each day to keep it alive.'
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const lines = streaks.slice(0, 10).map((streak, index) => {
            const partnerId = streak.users.find((id) => id !== userId) || streak.users[0];
            return `**${index + 1}.** <@${partnerId}> — **${streak.currentCount} day${streak.currentCount === 1 ? '' : 's'}** (best: ${streak.best})`;
        });

        const embed = createEmbed({
            title: 'Your Active Streaks',
            description: lines.join('\n'),
            color: 'primary'
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};
