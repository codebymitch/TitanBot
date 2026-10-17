import { EmbedBuilder } from 'discord.js';
import { setBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const month = interaction.options.getInteger("month")!;
        const day = interaction.options.getInteger("day")!;
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;

        const result = await setBirthday(client, guildId, userId, month, day);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstag gespeichert!')
            .setDescription(`Dein Geburtstag ist jetzt der **${result.data.day}. ${result.data.monthName}**!`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
} satisfies SubcommandModule;