import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import type { Command } from '../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Commands für das Geburtstagssystem')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Lege deinen Geburtstag fest')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Geburtsmonat (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Tag des Geburtstags (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Geburtstagsinfos anzeigen')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Nutzer, dessen Geburtstag du sehen willst')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Alle Geburtstage auf dem Server anzeigen')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Deinen Geburtstag entfernen')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('Anstehende Geburtstage anzeigen')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Kanal für Geburtstagsankündigungen setzen oder deaktivieren. („Server verwalten“ nötig)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Der Textkanal für Ankündigungen. Leer lassen zum Deaktivieren.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return await birthdaySet.execute(interaction, config, client);
            case 'info':
                return await birthdayInfo.execute(interaction, config, client);
            case 'list':
                return await birthdayList.execute(interaction, config, client);
            case 'remove':
                return await birthdayRemove.execute(interaction, config, client);
            case 'next':
                return await nextBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unbekannter Subcommand' });
        }
    }
} satisfies Command;