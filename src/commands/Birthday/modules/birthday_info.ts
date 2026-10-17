import { EmbedBuilder } from 'discord.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser("user") || interaction.user;
        const userId = targetUser.id;
        const guildId = interaction.guildId!;

        const birthdayData = await getUserBirthday(client, guildId, userId);

        if (!birthdayData) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Kein Geburtstag gefunden')
                .setDescription(targetUser.id === interaction.user.id 
                    ? "Du hast deinen Geburtstag noch nicht eingetragen. Nutze `/birthday set`, um ihn hinzuzufügen!"
                    : `${targetUser.username} hat noch keinen Geburtstag eingetragen.`);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstagsinfo')
            .setDescription(`**Datum:** ${birthdayData.day}. ${birthdayData.monthName}\n**Nutzer:** ${targetUser.toString()}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Birthday info retrieved successfully', {
            userId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName: 'birthday_info'
        });
    }
} satisfies SubcommandModule;