import { SlashCommandBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { setShiftStartRole, setShiftBreakRole, setShiftStopRole } from '../../services/shiftService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shiftconfig')
        .setDescription('Configure the shift management system')
        .addSubcommand(sub =>
            sub
                .setName('setstartrole')
                .setDescription('Set the role that is allowed to start shifts')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role that can use the Start Shift button')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('setbreakrole')
                .setDescription('Set the role that is allowed to use break/resume')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role that can use the Break/Resume button')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('setstoprole')
                .setDescription('Set the role that is allowed to stop shifts')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role that can use the Stop Shift button')
                        .setRequired(true)
                )
        ),
    category: 'Staff',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('Shiftconfig interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shiftconfig',
            });
            return;
        }

        try {
            // Admin-only
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            'You need **Administrator** permissions to configure the shift system.'
                        ),
                    ],
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const role = interaction.options.getRole('role');
            const guildId = interaction.guildId;

            const subcommandMeta = {
                setstartrole: {
                    fn: setShiftStartRole,
                    label: 'Shift Start Role',
                    description: `Members with this role can now use the **Start Shift** button in \`/shift\`.`,
                },
                setbreakrole: {
                    fn: setShiftBreakRole,
                    label: 'Shift Break Role',
                    description: `Members with this role can now use the **Break/Resume** button in \`/shift\`.`,
                },
                setstoprole: {
                    fn: setShiftStopRole,
                    label: 'Shift Stop Role',
                    description: `Members with this role can now use the **Stop Shift** button in \`/shift\`.`,
                },
            };

            const meta = subcommandMeta[subcommand];
            if (!meta) return;

            await meta.fn(guildId, role.id);

            const embed = createEmbed({
                title: '⚙️ Shift Role Configured',
                description: `The **${meta.label}** has been set to ${role}.\n\n${meta.description}`,
                color: 'success',
                fields: [
                    { name: 'Role', value: role.toString(), inline: true },
                    { name: 'Role ID', value: role.id, inline: true },
                ],
                timestamp: true,
            });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('Shiftconfig command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'shiftconfig_failed' });
        }
    },
};
