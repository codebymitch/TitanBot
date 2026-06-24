import { logger } from '../utils/logger.js';
import { errorEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { handleFightResult } from '../services/osrsStakingService.js';
import { getFight } from '../utils/database/fights.js';
import { saveFight } from '../utils/database/fights.js';
import { createFightDisputeTicket } from '../utils/osrsFightDispute.js';
import {
    createFightCompletedEmbed,
    createFightCancelledEmbed,
    createFightDisputeEmbed,
    createFightConfirmedEmbed,
    createFightResultConfirmationRow,
} from '../utils/osrsStakingPresentation.js';

export default {
    customId: 'fight_result',
    async execute(interaction, client, args) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const [action, fightId] = args;

        if (!fightId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Invalid fight ID.')],
            });
            return;
        }

        try {
            const fight = await getFight(client, fightId);
            if (!fight) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Fight not found.')],
                });
                return;
            }

            // Verify the user is one of the fighters
            if (interaction.user.id !== fight.challenger_id && interaction.user.id !== fight.opponent_id) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('You are not part of this fight.')],
                });
                return;
            }

            if (action === 'accept') {
                // Accept button: process the fight result
                const result = interaction.user.id === fight.reported_winner ? 'accept' : 'accept';

                const { fight: updatedFight, outcome, winnerId } = await handleFightResult(
                    client,
                    interaction.guildId,
                    interaction.user.id,
                    result,
                    fightId,
                );

                if (outcome === 'resolved') {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [createFightCompletedEmbed(updatedFight)],
                    });
                    return;
                }

                if (outcome === 'refunded') {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [createFightCancelledEmbed(updatedFight, 'Both fighters confirmed the fight is cancelled. Both stakes have been refunded.')],
                    });
                    return;
                }

                if (outcome === 'dispute') {
                    const ticketChannel = await createFightDisputeTicket(client, interaction.guild, interaction.member, updatedFight);

                    if (ticketChannel) {
                        const refreshedFight = await getFight(client, updatedFight.id);
                        if (refreshedFight) {
                            refreshedFight.ticketId = ticketChannel.id;
                            await saveFight(client, refreshedFight);
                        }

                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [createFightDisputeEmbed(updatedFight, ticketChannel.id)],
                        });
                    } else {
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [createFightDisputeEmbed(updatedFight, null)],
                        });
                    }
                    return;
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createFightConfirmedEmbed(updatedFight, interaction.user.id, 'accept')],
                    components: [createFightResultConfirmationRow(updatedFight.id)],
                });
            } else if (action === 'dispute') {
                // Dispute button: create ticket and hold funds in escrow
                const ticketChannel = await createFightDisputeTicket(client, interaction.guild, interaction.member, fight);

                if (ticketChannel) {
                    const updatedFight = await getFight(client, fightId);
                    if (updatedFight) {
                        updatedFight.ticketId = ticketChannel.id;
                        updatedFight.status = 'ticket_required';
                        await saveFight(client, updatedFight);
                    }

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [createFightDisputeEmbed(fight, ticketChannel.id)],
                    });
                } else {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [createFightDisputeEmbed(fight, null)],
                    });
                }
            } else {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Unknown action.')],
                });
            }
        } catch (error) {
            logger.error('Error handling fight result button:', {
                fightId,
                action,
                userId: interaction.user.id,
                error: error.message,
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.message)],
            });
        }
    },
};
