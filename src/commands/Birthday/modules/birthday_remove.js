import { EmbedBuilder } from 'discord.js';
import { deleteBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await deleteBirthday(client, guildId, userId);

        if (result.status === 'not_found') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('No Birthday Found')
                .setDescription('You don\'t have a birthday set to remove.');
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Birthday Removed')
            .setDescription('Your birthday has been successfully removed from the server.');
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
};