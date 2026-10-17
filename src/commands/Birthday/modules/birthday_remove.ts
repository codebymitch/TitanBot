import { EmbedBuilder } from 'discord.js';
import { deleteBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId!;

        const result = await deleteBirthday(client, guildId, userId);

        if (result.status === 'not_found') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Kein Geburtstag gefunden')
                .setDescription('Du hast keinen Geburtstag eingetragen, den du entfernen könntest.');
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstag entfernt')
            .setDescription('Dein Geburtstag wurde vom Server entfernt.');
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
} satisfies SubcommandModule;