import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId!, 5);

        if (next5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage gefunden')
                .setDescription('Auf diesem Server sind noch keine Geburtstage eingetragen. Nutze `/birthday set`, um deinen hinzuzufügen!');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild!.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                deleteBirthday(client, interaction.guildId!, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Heute!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Morgen!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} Tag${birthday.daysUntil > 1 ? 'en' : ''}`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine anstehenden Geburtstage')
                .setDescription('Für die aktuellen Mitglieder stehen keine Geburtstage an.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList = `🎂 **Die nächsten 5 Geburtstage**\n\nDas sind die nächsten 5 Geburtstage auf ${interaction.guild!.name}:\n\n`;
        displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild!.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Heute!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Morgen!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} Tag${birthday.daysUntil > 1 ? 'en' : ''}`;
            }

            birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **Datum:** ${birthday.day}. ${birthday.monthName}\n⏰ **Wann:** ${timeUntil}\n\n`;
        }

        birthdayList += `Nutze /birthday set, um deinen Geburtstag einzutragen!`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Die nächsten 5 Geburtstage')
            .setDescription(birthdayList);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Next birthdays retrieved successfully', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
} satisfies SubcommandModule;