import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
    VOICE_MILESTONE_PRESET,
    getVoiceMilestoneConfig,
    saveVoiceMilestoneConfig,
    getVoiceMilestoneData,
    getMilestoneProgress,
    formatVoiceDuration,
    resetVoiceMilestoneData,
    applyMilestonesForMember,
    recheckAllMembers,
    sendVoiceMilestoneTestAnnouncement,
} from '../../services/voiceMilestoneService.js';

const HOUR_MS = 60 * 60 * 1000;

function canManage(member) {
    return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

function roleIsAssignable(guild, role) {
    if (!role || role.id === guild.id) return false;
    if (role.managed) return false;
    const me = guild.members.me;
    if (!me) return false;
    return role.position < me.roles.highest.position;
}

function buildProgressBar(currentMs, targetHours, size = 12) {
    if (!targetHours) return `${'█'.repeat(size)}  100%`;
    const pct = Math.min(1, currentMs / (targetHours * HOUR_MS));
    const filled = Math.round(size * pct);
    return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}  ${Math.round(pct * 100)}%`;
}

function milestoneListLines(guild, milestones) {
    if (milestones.length === 0) {
        return '*No milestones configured yet. Run `/voicemilestone setup`.*';
    }

    return milestones.map((milestone) => {
        const role = milestone.roleId ? guild.roles.cache.get(milestone.roleId) : null;
        const roleText = role ? role.toString() : '`not set`';
        return `**${milestone.hours}h** · ${milestone.label} · ${roleText}`;
    }).join('\n');
}

function baseEmbed(title, config) {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(config.enabled ? getColor('success') : getColor('warning'));
}

async function replyEmbed(interaction, embed) {
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleSetup(interaction, client) {
    const guild = interaction.guild;
    const config = await getVoiceMilestoneConfig(client, guild.id);
    const existingByHours = new Map(config.milestones.map((m) => [m.hours, m]));

    const milestones = VOICE_MILESTONE_PRESET.map((preset) => ({
        hours: preset.hours,
        label: preset.label,
        roleId: existingByHours.get(preset.hours)?.roleId ?? null,
    }));

    const saved = await saveVoiceMilestoneConfig(client, guild.id, {
        enabled: true,
        announcementChannelId: config.announcementChannelId,
        milestones,
    });
    const missing = saved.milestones.filter((m) => !m.roleId).length;

    const embed = baseEmbed('Voice Milestone Setup', saved)
        .setDescription(
            `Loaded the **Manay Society** ladder (${saved.milestones.length} tiers). ` +
            'Tracking is now enabled.\n\n' +
            (missing > 0
                ? `Assign each tier's role with \`/voicemilestone setrole\` — ${missing} tier(s) still need a role.`
                : 'Every tier has a role assigned.') +
            '\nSet the public announcement channel with `/voicemilestone setchannel`.' +
            '\nPreview an announcement with `/voicemilestone test`.',
        )
        .addFields(
            { name: 'Ladder', value: milestoneListLines(guild, saved.milestones) },
            {
                name: 'Announcement Channel',
                value: saved.announcementChannelId ? `<#${saved.announcementChannelId}>` : '`Not set`',
                inline: true,
            },
        );

    await replyEmbed(interaction, embed);
}

async function handleSetRole(interaction, client) {
    const guild = interaction.guild;
    const hours = interaction.options.getInteger('hours', true);
    const role = interaction.options.getRole('role', true);
    const label = interaction.options.getString('label');

    const config = await getVoiceMilestoneConfig(client, guild.id);

    if (!role || role.id === guild.id) {
        await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Please choose a specific role — the `@everyone` role cannot be used.',
        });
        return;
    }

    const index = config.milestones.findIndex((m) => m.hours === hours);

    if (index >= 0) {
        config.milestones[index].roleId = role.id;
        if (label) config.milestones[index].label = label;
    } else {
        config.milestones.push({ hours, label: label || `${hours}h`, roleId: role.id });
    }

    const saved = await saveVoiceMilestoneConfig(client, guild.id, config);

    const embed = baseEmbed(`Tier ${hours}h updated`, saved)
        .setDescription(
            `**${hours}h** now grants ${role}.\n` +
            (roleIsAssignable(guild, role)
                ? 'The role is assignable.'
                : '⚠️ This role is above my highest role, so I cannot assign it. Move it below my role.'),
        )
        .addFields({ name: 'Ladder', value: milestoneListLines(guild, saved.milestones) });

    await replyEmbed(interaction, embed);
}

async function handleSetChannel(interaction, client) {
    const guild = interaction.guild;
    const channel = interaction.options.getChannel('channel');
    const config = await getVoiceMilestoneConfig(client, guild.id);
    const saved = await saveVoiceMilestoneConfig(client, guild.id, {
        ...config,
        announcementChannelId: channel?.id ?? null,
    });

    const embed = baseEmbed('Voice Milestone Announcements', saved)
        .setDescription(
            channel
                ? `Milestone announcements will be posted in ${channel}.`
                : 'Milestone announcements are disabled. Voice tracking and role rewards remain enabled.',
        );
    await replyEmbed(interaction, embed);
}

async function handleTest(interaction, client) {
    const hours = interaction.options.getInteger('hours');
    const result = await sendVoiceMilestoneTestAnnouncement(
        client,
        interaction.guild,
        interaction.user.id,
        hours,
        interaction.member,
    );

    if (!result.ok) {
        const message = result.reason === 'channel_not_set'
            ? 'Set an announcement channel first with `/voicemilestone setchannel`.'
            : result.reason === 'milestone_not_found'
                ? 'That tier is not configured. Run `/voicemilestone setup` first.'
                : 'Could not send the preview. Check the bot has access and Attach Files permission in the announcement channel.';
        await replyUserError(interaction, {
            type: ErrorTypes.CONFIGURATION,
            message,
        });
        return;
    }

    const embed = baseEmbed('Voice Milestone Test', { enabled: true })
        .setDescription(
            `Preview sent to <#${result.channelId}>. No voice time or roles were changed.` +
            (result.imageGenerated ? '' : '\nThe text preview was sent, but the card image could not be rendered.'),
        );
    await replyEmbed(interaction, embed);
}

async function handleRemove(interaction, client) {
    const guild = interaction.guild;
    const hours = interaction.options.getInteger('hours', true);

    const config = await getVoiceMilestoneConfig(client, guild.id);
    const filtered = config.milestones.filter((m) => m.hours !== hours);

    if (filtered.length === config.milestones.length) {
        await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `No milestone is configured at **${hours}h**.`,
        });
        return;
    }

    const saved = await saveVoiceMilestoneConfig(client, guild.id, { ...config, milestones: filtered });

    const embed = baseEmbed('Milestone removed', saved)
        .setDescription(`Removed the **${hours}h** tier.`)
        .addFields({ name: 'Ladder', value: milestoneListLines(guild, saved.milestones) });

    await replyEmbed(interaction, embed);
}

async function handleList(interaction, client) {
    const guild = interaction.guild;
    const config = await getVoiceMilestoneConfig(client, guild.id);

    const embed = baseEmbed('Voice Milestones', config)
        .setDescription(
            `**Status:** ${config.enabled ? 'Enabled' : 'Disabled'}\n` +
            'Members keep the highest tier they have reached; lower tier roles are removed automatically.',
        )
        .addFields(
            { name: `Ladder (${config.milestones.length})`, value: milestoneListLines(guild, config.milestones) },
            {
                name: 'Announcement Channel',
                value: config.announcementChannelId ? `<#${config.announcementChannelId}>` : '`Not set`',
                inline: true,
            },
        );

    await replyEmbed(interaction, embed);
}

async function handleToggle(interaction, client) {
    const guild = interaction.guild;
    const enabled = interaction.options.getBoolean('enabled', true);

    const config = await getVoiceMilestoneConfig(client, guild.id);
    const saved = await saveVoiceMilestoneConfig(client, guild.id, { ...config, enabled });

    const embed = baseEmbed('Voice Milestones', saved)
        .setDescription(`Tracking is now **${saved.enabled ? 'enabled' : 'disabled'}**.`);

    await replyEmbed(interaction, embed);
}

async function handleProgress(interaction, client) {
    const guild = interaction.guild;
    const targetUser = interaction.options.getUser('user') || interaction.user;

    const config = await getVoiceMilestoneConfig(client, guild.id);
    const data = await getVoiceMilestoneData(client, guild.id, targetUser.id);
    const { current, next } = getMilestoneProgress(data.totalMs, config.milestones);

    const currentRole = current?.roleId ? guild.roles.cache.get(current.roleId) : null;

    const lines = [`**Total voice time:** ${formatVoiceDuration(data.totalMs)}`];
    lines.push(`**Current tier:** ${current ? `**${current.hours}h** · ${current.label}${currentRole ? ` (${currentRole})` : ''}` : 'None yet'}`);

    if (next) {
        const remaining = Math.max(0, next.hours * HOUR_MS - data.totalMs);
        lines.push(`**Next tier:** **${next.hours}h** · ${next.label} · ${formatVoiceDuration(remaining)} to go`);
        lines.push(buildProgressBar(data.totalMs, next.hours));
    } else {
        lines.push('**Next tier:** Max tier reached 🎉');
    }

    const embed = baseEmbed(`Voice Progress — ${targetUser.username}`, config)
        .setDescription(lines.join('\n'));

    await replyEmbed(interaction, embed);
}

async function handleRecheck(interaction, client) {
    const guild = interaction.guild;
    const targetUser = interaction.options.getUser('user');

    if (targetUser) {
        const result = await applyMilestonesForMember(client, guild.id, targetUser.id);
        const embed = baseEmbed('Milestones rechecked', { enabled: true })
            .setDescription(
                `Re-evaluated ${targetUser}.\n` +
                `Granted: ${result.granted ? `<@&${result.granted}>` : 'none'}\n` +
                `Removed: ${result.removed.length ? result.removed.map((id) => `<@&${id}>`).join(', ') : 'none'}`,
            );
        await replyEmbed(interaction, embed);
        return;
    }

    const { checked } = await recheckAllMembers(client, guild.id);
    const embed = baseEmbed('Milestones rechecked', { enabled: true })
        .setDescription(`Re-evaluated **${checked}** tracked member(s) in this server.`);

    await replyEmbed(interaction, embed);
}

async function handleReset(interaction, client) {
    const guild = interaction.guild;
    const targetUser = interaction.options.getUser('user', true);

    await resetVoiceMilestoneData(client, guild.id, targetUser.id);

    const embed = baseEmbed('Voice time reset', { enabled: true })
        .setDescription(
            `Cleared the tracked voice time for ${targetUser}. ` +
            'Existing milestone roles were left untouched.',
        );

    await replyEmbed(interaction, embed);
}

export default {
    data: new SlashCommandBuilder()
        .setName('voicemilestone')
        .setDescription('Reward members with roles based on total time spent in voice channels')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Load the Manay Society milestone ladder and enable tracking'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setrole')
                .setDescription('Assign a role to a voice milestone tier')
                .addIntegerOption((option) =>
                    option
                        .setName('hours')
                        .setDescription('The milestone threshold in hours')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100000))
                .addRoleOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The role granted at this tier')
                        .setRequired(true))
                .addStringOption((option) =>
                    option
                        .setName('label')
                        .setDescription('Optional display name for this tier')
                        .setRequired(false)
                        .setMaxLength(100)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setchannel')
                .setDescription('Set or disable the public milestone announcement channel')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Announcement text channel; leave empty to disable announcements')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('test')
                .setDescription('Send a preview announcement without changing voice time or roles')
                .addIntegerOption((option) => {
                    option
                        .setName('hours')
                        .setDescription('Milestone tier to preview (defaults to the first tier)')
                        .setRequired(false);
                    for (const milestone of VOICE_MILESTONE_PRESET) {
                        option.addChoices({
                            name: `${milestone.label} (${milestone.hours}h)`,
                            value: milestone.hours,
                        });
                    }
                    return option;
                }))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove a voice milestone tier')
                .addIntegerOption((option) =>
                    option
                        .setName('hours')
                        .setDescription('The milestone threshold in hours to remove')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100000)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all voice milestone tiers'))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable voice milestone tracking')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Whether tracking should be on')
                        .setRequired(true)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('progress')
                .setDescription('Show voice milestone progress for you or another member')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The member to check (defaults to you)')
                        .setRequired(false)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('recheck')
                .setDescription('Re-apply milestone roles based on recorded time')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('Only recheck this member (defaults to everyone)')
                        .setRequired(false)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName('reset')
                .setDescription('Reset the tracked voice time for a member')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('The member whose voice time should be reset')
                        .setRequired(true))),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand !== 'progress' && !canManage(interaction.member)) {
            await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'You need **Manage Server** permission to configure voice milestones.',
            });
            return;
        }

        await InteractionHelper.safeDefer(interaction);

        try {
            switch (subcommand) {
                case 'setup':
                    await handleSetup(interaction, client);
                    break;
                case 'setrole':
                    await handleSetRole(interaction, client);
                    break;
                case 'setchannel':
                    await handleSetChannel(interaction, client);
                    break;
                case 'test':
                    await handleTest(interaction, client);
                    break;
                case 'remove':
                    await handleRemove(interaction, client);
                    break;
                case 'list':
                    await handleList(interaction, client);
                    break;
                case 'toggle':
                    await handleToggle(interaction, client);
                    break;
                case 'progress':
                    await handleProgress(interaction, client);
                    break;
                case 'recheck':
                    await handleRecheck(interaction, client);
                    break;
                case 'reset':
                    await handleReset(interaction, client);
                    break;
                default:
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Unknown subcommand.',
                    });
            }
        } catch (error) {
            logger.error('voicemilestone command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Something went wrong while handling the voice milestone command.',
            });
        }
    },
};
