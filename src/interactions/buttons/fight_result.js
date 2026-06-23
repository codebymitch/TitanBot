import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleFightResult } from '../../services/osrsStakingService.js';
import { getFight, saveFight } from '../../utils/database/fights.js';
import { createFightDisputeTicket } from '../../utils/osrsFightDispute.js';
import {
    createFightCancelledEmbed,
    createFightCompletedEmbed,
    createFightDisputeEmbed,
    createFightResultConfirmationRow,
} from '../../utils/osrsStakingPresentation.js';

function getPendingResponderId(fight) {
    if (fight?.challengerConfirmed !== null && fight?.opponentConfirmed === null) {
        return fight.opponent_id;
    }

    if (fight?.opponentConfirmed !== null && fight?.challengerConfirmed === null) {
        return fight.challenger_id;
    }

    return null;
}

export default {
    name: 'fight_result',
    async execute(interaction, client, args) {
        const [action, fightId] = args;

        try {
            if (!fightId || !['accept', 'decline'].includes(action)) {
                throw new Error('Invalid fight result button.');
            }

            const currentFight = await getFight(client, fightId);
            if (!currentFight) {
                throw new Error('Fight not found.');
            }

            const responderId = getPendingResponderId(currentFight);
            if (!responderId) {
                throw new Error('Both fighters have already confirmed, or this confirmation request is no longer active.');
            }

            if (interaction.user.id !== responderId) {
                throw new Error('Only the opposing fighter can use these confirmation buttons.');
            }

            const { fight, outcome } = await handleFightResult(client, interaction.guildId, interaction.user.id, action, fightId);
            const disabledRow = createFightResultConfirmationRow(fight.id, true);

            if (outcome === 'resolved') {
                await interaction.update({
                    embeds: [createFightCompletedEmbed(fight)],
                    components: [disabledRow],
                });
                return;
            }

            if (outcome === 'refunded') {
                await interaction.update({
                    embeds: [createFightCancelledEmbed(fight, 'Both fighters confirmed the fight is cancelled. Both stakes have been refunded.')],
                    components: [disabledRow],
                });
                return;
            }

            if (outcome === 'dispute') {
                const ticketChannel = await createFightDisputeTicket(client, interaction.guild, interaction.member, fight);
                if (ticketChannel) {
                    const updatedFight = await getFight(client, fight.id);
                    if (updatedFight) {
                        updatedFight.ticketId = ticketChannel.id;
                        await saveFight(client, updatedFight);
                    }
                }

                await interaction.update({
                    embeds: [createFightDisputeEmbed(fight, ticketChannel?.id || null)],
                    components: [disabledRow],
                });
                return;
            }

            throw new Error('Unexpected fight result state.');
        } catch (error) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(error.message)],
                ephemeral: true,
            });
        }
    },
};
