import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TempRoleService, scheduleTempRoleRemoval } from '../../services/tempRoleService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('temprole')
        .setDescription('Assign a role that automatically expires after a set duration')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Give a user a temporary role')
                .addUserOption(o =>
                    o.setName('user').setDescription('User to assign the role to').setRequired(true)
                )
                .addRoleOption(o =>
                    o.setName('role').setDescription('Role to assign').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('duration').setDescription('Duration e.g. 30m, 2h, 1d, 1w (max 30 days)').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a temporary role from a user early')
                .addUserOption(o =>
                    o.setName('user').setDescription('User to remove the role from').setRequired(true)
                )
                .addRoleOption(o =>
                    o.setName('role').setDescription('Role to remove').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all active temporary roles in this server')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            if (sub === 'add') {
                const target = interaction.options.getMember('user');
                const role = interaction.options.getRole('role');
                const durationStr = interaction.options.getString('duration');
                const durationMs = parseDuration(durationStr);

                if (!target) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Found', 'That user is not in this server.')],
                    });
                }
                if (!durationMs) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Invalid Duration', 'Use formats like `30m`, `2h`, `1d`, `1w`. Max 30 days.')],
                    });
                }
                if (durationMs > 30 * 24 * 60 * 60 * 1000) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Too Long', 'Maximum duration is 30 days.')],
                    });
                }

                const botMember = interaction.guild.members.me;
                if (botMember.roles.highest.comparePositionTo(role) <= 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Permission Error', "That role is above my highest role — I can't assign it.")],
                    });
                }

                await target.roles.add(role, `Temp role assigned by ${interaction.user.tag}`);

                const expiresAt = Date.now() + durationMs;
                const { entry } = await TempRoleService.add(client, guildId, {
                    userId: target.id, roleId: role.id, expiresAt, assignedBy: interaction.user.id,
                });
                scheduleTempRoleRemoval(client, guildId, entry);

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed(
                        'Temp Role Assigned',
                        `${target} now has ${role} for **${durationStr}**.\nExpires: <t:${Math.floor(expiresAt / 1000)}:R>`,
                    )],
                });
            }

            if (sub === 'remove') {
                const target = interaction.options.getMember('user');
                const role = interaction.options.getRole('role');

                if (!target) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Found', 'That user is not in this server.')],
                    });
                }

                const result = await TempRoleService.remove(client, guildId, target.id, role.id);
                if (!result.success) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Found', 'No active temp role found for that user and role combination.')],
                    });
                }

                await target.roles.remove(role, `Temp role removed early by ${interaction.user.tag}`).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Temp Role Removed', `Removed ${role} from ${target} early.`)],
                });
            }

            if (sub === 'list') {
                const entries = await TempRoleService.list(client, guildId);

                if (!entries.length) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: 'Active Temp Roles',
                            description: 'No active temp roles. Use `/temprole add` to create one.',
                            color: 'blue',
                        })],
                    });
                }

                const lines = entries.map(e => {
                    const expiry = Math.floor(e.expiresAt / 1000);
                    return `<@${e.userId}> → <@&${e.roleId}> — expires <t:${expiry}:R>`;
                }).join('\n');

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: `Active Temp Roles (${entries.length})`,
                        description: lines,
                        color: 'blue',
                    })],
                });
            }
        } catch (error) {
            logger.error('Temprole command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Error', 'Something went wrong. Try again later.')],
            });
        }
    },
};

function parseDuration(str) {
    const match = str.trim().match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk|week)s?$/i);
    if (!match) return null;
    const num = parseInt(match[1]);
    if (num <= 0) return null;
    const unit = match[2].toLowerCase();
    const map = {
        s: 1000, sec: 1000,
        m: 60000, min: 60000,
        h: 3600000, hr: 3600000,
        d: 86400000, day: 86400000,
        w: 604800000, wk: 604800000, week: 604800000,
    };
    return map[unit] != null ? num * map[unit] : null;
}
