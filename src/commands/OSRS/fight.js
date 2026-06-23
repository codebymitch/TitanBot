import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { parseHumanAmount } from '../../utils/economy.js';
import { handleFightChallenge, saveFightMessage } from '../../services/osrsStakingService.js';
import { createFightActionRow, createFightChallengeEmbed } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fight')
        .setDescription('Challenge a Discord member to an OSRS gp stake fight')
        .addUserOption((option) =>
            option
                .setName('opponent')
                .setDescription('The member you want to challenge')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('amount')
                .setDescription('The gp amount each fighter will stake (e.g. 10m)')
                .setRequired(true),
        ),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const opponent = interaction.options.getUser('opponent', true);
        if (opponent.bot) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('You cannot challenge a bot to an OSRS fight.')] });
            return;
        }

        const parsedAmount = parseHumanAmount(interaction.options.getString('amount', true));
        if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Stake amount must be a valid whole gp amount (for example 10m or 500k).')] });
            return;
        }

        try {
            const fight = await handleFightChallenge(client, interaction.guildId, interaction.user.id, opponent.id, parsedAmount);
            await InteractionHelper.safeEditReply(interaction, {
                content: `<@${opponent.id}>`,
                allowedMentions: { users: [opponent.id] },
                embeds: [createFightChallengeEmbed(fight)],
                components: [createFightActionRow(fight.id)],
            });

            const reply = await interaction.fetchReply();
            if (reply?.id) {
                await saveFightMessage(client, fight.id, reply.channelId, reply.id);
            }
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(error.message)] });
        }
    }, { command: 'fight' }),
};
