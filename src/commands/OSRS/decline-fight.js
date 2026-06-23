import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleFightDecline } from '../../services/osrsStakingService.js';
import { createFightCancelledEmbed } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('decline-fight')
        .setDescription('Decline a pending OSRS fight challenge')
        .addStringOption((option) =>
            option
                .setName('fight-id')
                .setDescription('Optional fight ID if you have multiple pending fights')
                .setRequired(false),
        ),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const fightId = interaction.options.getString('fight-id');
            const userId = interaction.user.id;
            const fight = await handleFightDecline(
                client,
                interaction.guildId,
                fightId,
                userId,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createFightCancelledEmbed(fight, 'The fight was declined and both stakes were refunded.')],
            });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(error.message)] });
        }
    }, { command: 'decline-fight' }),
};
