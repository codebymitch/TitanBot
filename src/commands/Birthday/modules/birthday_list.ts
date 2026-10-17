import { EmbedBuilder } from 'discord.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const guildId = interaction.guildId!;

        const sortedBirthdays = await getAllBirthdays(client, guildId);

        if (sortedBirthdays.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage')
                .setDescription('Auf diesem Server wurden noch keine Geburtstage eingetragen.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const userIds = sortedBirthdays.map(b => b.userId);
        const fetchedMembers = await interaction.guild!.members.fetch({ user: userIds }).catch(() => null);

        let birthdayList = '';
        let displayIndex = 0;
        const staleUserIds = [];

        for (const birthday of sortedBirthdays) {
            if (fetchedMembers && !fetchedMembers.has(birthday.userId)) {
                staleUserIds.push(birthday.userId);
                continue;
            }
            displayIndex++;
            birthdayList += `${displayIndex}. <@${birthday.userId}> - ${birthday.day}. ${birthday.monthName}\n`;
        }

        if (fetchedMembers && staleUserIds.length > 0) {
            for (const userId of staleUserIds) {
                deleteBirthday(client, guildId, userId).catch(() => null);
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage')
                .setDescription('Keines der aktuellen Mitglieder hat einen Geburtstag eingetragen.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        birthdayList = `**${displayIndex} Geburtstag${displayIndex !== 1 ? 'e' : ''} auf ${interaction.guild!.name}**\n\n` + birthdayList;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstage auf dem Server')
            .setDescription(`${birthdayList}\n\nGesamt: ${displayIndex} Geburtstag${displayIndex !== 1 ? 'e' : ''}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Birthday list retrieved successfully', {
            userId: interaction.user.id,
            guildId,
            birthdayCount: displayIndex,
            staleRemoved: staleUserIds.length,
            commandName: 'birthday_list'
        });
    }
} satisfies SubcommandModule;