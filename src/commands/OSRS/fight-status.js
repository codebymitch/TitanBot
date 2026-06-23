import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getActiveUserFights, getUserFightHistory } from '../../utils/database/fights.js';
import { formatFightSummaryLine } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fight-status')
        .setDescription('Show your pending fights, active fights, and recent fight history'),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const [activeFights, history] = await Promise.all([
            getActiveUserFights(client, interaction.guildId, interaction.user.id),
            getUserFightHistory(client, interaction.guildId, interaction.user.id, 5),
        ]);

        const pending = activeFights.filter((fight) => fight.status === 'pending');
        const active = activeFights.filter((fight) => fight.status === 'active');

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: 'OSRS Fight Status',
                    color: 'info',
                    fields: [
                        {
                            name: 'Pending',
                            value: pending.length > 0
                                ? pending.map((fight) => formatFightSummaryLine(fight, interaction.user.id)).join('\n')
                                : 'No pending fights.',
                            inline: false,
                        },
                        {
                            name: 'Active',
                            value: active.length > 0
                                ? active.map((fight) => formatFightSummaryLine(fight, interaction.user.id)).join('\n')
                                : 'No active fights.',
                            inline: false,
                        },
                        {
                            name: 'Recent History',
                            value: history.length > 0
                                ? history.map((fight) => formatFightSummaryLine(fight, interaction.user.id)).join('\n')
                                : 'No recent fight history.',
                            inline: false,
                        },
                    ],
                }),
            ],
        });
    }, { command: 'fight-status' }),
};
