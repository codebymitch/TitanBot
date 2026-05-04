import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { botConfig } from '../../config/botConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed } from '../../utils/embeds.js';

export default {
    name: 'servers-leave',
    async execute(interaction) {
        if (!botConfig.commands.owners.includes(interaction.user.id)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Access Denied', 'This button is restricted to the bot owner.')],
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('servers-leave-modal')
            .setTitle('Leave Server');

        const serverIdInput = new TextInputBuilder()
            .setCustomId('server_id')
            .setLabel('Server ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Paste the server ID here')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20);

        modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
        await interaction.showModal(modal);
    },
};
