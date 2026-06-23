import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleFightAccept, handleFightDecline } from '../../services/osrsStakingService.js';
import {
    createFightActionRow,
    createFightActiveEmbed,
    createFightCancelledEmbed,
} from '../../utils/osrsStakingPresentation.js';

export default {
    name: 'fight',
    async execute(interaction, client, args) {
        const [action, fightId] = args;

        try {
            if (action === 'accept') {
                const fight = await handleFightAccept(client, interaction.guildId, fightId, interaction.user.id);
                await interaction.update({
                    embeds: [createFightActiveEmbed(fight)],
                    components: [createFightActionRow(fight.id, true)],
                });
                return;
            }

            if (action === 'decline') {
                const fight = await handleFightDecline(client, interaction.guildId, fightId, interaction.user.id);
                await interaction.update({
                    embeds: [createFightCancelledEmbed(fight, 'The fight was declined and both stakes were refunded.')],
                    components: [createFightActionRow(fight.id, true)],
                });
                return;
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Unknown fight action.')],
                ephemeral: true,
            });
        } catch (error) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(error.message)],
                ephemeral: true,
            });
        }
    },
};
