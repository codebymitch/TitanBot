import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleFightReport } from '../../services/osrsStakingService.js';
import { createFightCompletedEmbed, createFightReportedEmbed } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report-fight')
        .setDescription('Report the winner of your OSRS stake fight')
        .addUserOption((option) =>
            option
                .setName('winner')
                .setDescription('The Discord member who won the fight')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('fight-id')
                .setDescription('Optional fight ID if you have multiple active fights')
                .setRequired(false),
        ),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const winner = interaction.options.getUser('winner', true);
            const fight = await handleFightReport(
                client,
                interaction.guildId,
                interaction.user.id,
                winner.id,
                interaction.options.getString('fight-id'),
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [fight.winner_id ? createFightCompletedEmbed(fight) : createFightReportedEmbed(fight, winner.id)],
            });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(error.message)] });
        }
    }, { command: 'report-fight' }),
};
