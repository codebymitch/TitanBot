import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, {});

        const target = interaction.options.getUser('user');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (target.id === userId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'You cannot start a streak with yourself.'
            });
        }

        if (target.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bots cannot keep streaks.'
            });
        }

        await StreakService.sendStreakRequest(client, guildId, userId, target.id, {
            channelId: interaction.channelId
        });

        const embed = createEmbed({
            title: 'Streak Request',
            description: `${interaction.user} wants to start a streak with ${target}.\n\n${target}, use the buttons below to respond.`,
            color: 'primary',
            footer: 'The streak starts counting once accepted and both of you interact each day.'
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`streak_accept:${userId}:${target.id}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`streak_decline:${userId}:${target.id}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });
    }
};
