import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Birthday system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set your birthday')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Birth month (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Birth day (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View birthday information')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to check birthday for')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all birthdays in the server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove your birthday')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('Show upcoming birthdays')
        ),

    async execute(interaction, config, client) {
try {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'set':
                    return birthdaySet.execute(interaction, config, client);
                case 'info':
                    return birthdayInfo.execute(interaction, config, client);
                case 'list':
                    return birthdayList.execute(interaction, config, client);
                case 'remove':
                    return birthdayRemove.execute(interaction, config, client);
                case 'next':
                    return nextBirthdays.execute(interaction, config, client);
                default:
                    return interaction.reply({
                        embeds: [errorEmbed('Error', 'Unknown subcommand')],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            console.error('Birthday command error:', error);
            
            const errorMessage = {
                embeds: [errorEmbed('System Error', 'Could not process birthday command at this time.')],
                flags: MessageFlags.Ephemeral
            };
            
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply(errorMessage);
            } else {
                return interaction.editReply(errorMessage);
            }
        }
    }
};

