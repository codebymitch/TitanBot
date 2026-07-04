import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { buildQueueReply } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue')
        .addIntegerOption((opt) =>
            opt.setName('page').setDescription('Page number').setMinValue(1),
        ),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            const page = (interaction.options.getInteger('page') || 1) - 1;
            const payload = buildQueueReply(client, interaction.guild.id, page);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: payload.embeds,
                components: payload.components,
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'queue' });
        }
    },
};
