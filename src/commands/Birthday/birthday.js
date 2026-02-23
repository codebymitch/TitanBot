import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
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
                    return await birthdaySet.execute(interaction, config, client);
                case 'info':
                    return await birthdayInfo.execute(interaction, config, client);
                case 'list':
                    return await birthdayList.execute(interaction, config, client);
                case 'remove':
                    return await birthdayRemove.execute(interaction, config, client);
                case 'next':
                    return await nextBirthdays.execute(interaction, config, client);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed('Error', 'Unknown subcommand')],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error('Birthday command execution failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday',
                subcommand: interaction.options.getSubcommand()
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday',
                source: 'birthday_command'
            });
        }
    }
};


