import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { resolveFightDispute } from '../../services/osrsStakingService.js';
import { getOsrsAdminPermissionError, isAuthorizedOsrsAdmin } from '../../utils/osrsAdminAuth.js';
import {
    createFightDisputeResolutionRow,
    createFightDisputeResolvedEmbed,
    formatFightPayoutSummary,
    getFightResolutionLabel,
} from '../../utils/osrsStakingPresentation.js';
import { logger } from '../../utils/logger.js';

async function sendResolutionDm(client, userId, embed) {
    try {
        const user = await client.users.fetch(userId);
        await user.send({ embeds: [embed] });
    } catch (error) {
        logger.warn('[FIGHT_DISPUTE_RESOLVE] Failed to send dispute resolution DM', {
            userId,
            error: error.message,
        });
    }
}

function createResolutionDmEmbed(fight, resolverId) {
    return createEmbed({
        title: 'OSRS Fight Dispute Resolved',
        description: `Your dispute for fight **${fight.id}** has been resolved by <@${resolverId}>.`,
        color: fight.disputeResolution === 'refund_both' || fight.status === 'cancelled' ? 'warning' : 'success',
        fields: [
            { name: 'Resolution', value: getFightResolutionLabel(fight), inline: false },
            { name: 'Payout Summary', value: formatFightPayoutSummary(fight), inline: false },
        ],
    });
}

export default {
    name: 'fight_dispute_resolve',
    async execute(interaction, client, args) {
        const [resolution, fightId] = args;

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        try {
            if (!(await isAuthorizedOsrsAdmin(interaction, client))) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(getOsrsAdminPermissionError('resolve fight disputes'))],
                });
                return;
            }

            if (!fightId) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid dispute resolution button: missing fight ID.')],
                });
                return;
            }

            const fight = await resolveFightDispute(client, interaction.guildId, fightId, resolution, interaction.user.id);
            const resolutionEmbed = createFightDisputeResolvedEmbed(fight, interaction.user.id);

            await interaction.message.edit({
                components: [createFightDisputeResolutionRow(fight.id, true)],
            }).catch((error) => {
                logger.warn('[FIGHT_DISPUTE_RESOLVE] Failed to disable dispute resolution buttons', {
                    fightId: fight.id,
                    error: error.message,
                });
            });

            if (interaction.channel) {
                await interaction.channel.send({
                    content: `<@${fight.challenger_id}> <@${fight.opponent_id}>`,
                    embeds: [resolutionEmbed],
                    allowedMentions: { users: [fight.challenger_id, fight.opponent_id] },
                });
            }

            const dmEmbed = createResolutionDmEmbed(fight, interaction.user.id);
            await Promise.allSettled([
                sendResolutionDm(client, fight.challenger_id, dmEmbed),
                sendResolutionDm(client, fight.opponent_id, dmEmbed),
            ]);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '✅ Dispute Resolved',
                    description: `Resolved fight **${fight.id}** with **${getFightResolutionLabel(fight)}**.`,
                    color: 'success',
                })],
            });
        } catch (error) {
            logger.error('[FIGHT_DISPUTE_RESOLVE] Error resolving dispute', { error: error.message, fightId, resolution });
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.message)],
            });
        }
    },
};
