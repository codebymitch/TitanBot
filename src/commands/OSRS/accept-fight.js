import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleFightAccept } from '../../services/osrsStakingService.js';
import { createFightActiveEmbed } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('accept-fight')
        .setDescription('Accept a pending OSRS fight challenge')
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
            const fight = await handleFightAccept(
                client,
                interaction.guildId,
                interaction.options.getString('fight-id'),
                interaction.user.id,
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [createFightActiveEmbed(fight)] });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(error.message)] });
        }
    }, { command: 'accept-fight' }),
};
