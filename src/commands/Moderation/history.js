import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getColor } from '../../config/bot.js';
import { PunishmentService } from '../../services/punishmentService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const ACTION_EMOJI = {
    BAN:     '🔨',
    KICK:    '👢',
    TIMEOUT: '⏳',
    WARN:    '⚠️',
};

const ACTION_COLOR = {
    BAN:     0xe74c3c,
    KICK:    0xe67e22,
    TIMEOUT: 0xf39c12,
    WARN:    0xf1c40f,
};

export default {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('View full punishment history for a user')
        .addUserOption(o =>
            o.setName('target').setRequired(true).setDescription('User to look up')
        )
        .addStringOption(o =>
            o.setName('filter')
                .setDescription('Filter by punishment type')
                .addChoices(
                    { name: 'All',     value: 'ALL'     },
                    { name: 'Bans',    value: 'BAN'     },
                    { name: 'Kicks',   value: 'KICK'    },
                    { name: 'Timeouts', value: 'TIMEOUT' },
                    { name: 'Warns',   value: 'WARN'    },
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const target = interaction.options.getUser('target');
            if (!target) {
                throw new TitanBotError('Missing target', ErrorTypes.USER_INPUT,
                    'Please mention the user to look up.\nUsage: `nh!history @user`');
            }

            const filter = interaction.options.getString('filter') || 'ALL';
            const guildId = interaction.guildId;

            let history = await PunishmentService.getUserHistory(guildId, target.id, 100);

            if (filter !== 'ALL') {
                history = history.filter(p => p.action === filter);
            }

            const counts = await PunishmentService.countByAction(guildId, target.id);

            if (history.length === 0) {
                const embed = createEmbed({
                    title: `📋 History: ${target.tag}`,
                    description: filter === 'ALL'
                        ? '✅ This user has no punishment records.'
                        : `✅ No **${filter}** records found for this user.`
                }).setColor(getColor('success'))
                  .setThumbnail(target.displayAvatarURL({ dynamic: true }));

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            const PER_PAGE = 5;
            const totalPages = Math.ceil(history.length / PER_PAGE);
            let page = 1;

            const buildEmbed = (p) => {
                const start = (p - 1) * PER_PAGE;
                const slice = history.slice(start, start + PER_PAGE);

                const embed = createEmbed({
                    title: `📋 Punishment History: ${target.tag}`,
                    description: [
                        `🔨 Bans: **${counts.BAN}** | 👢 Kicks: **${counts.KICK}** | ⏳ Timeouts: **${counts.TIMEOUT}** | ⚠️ Warns: **${counts.WARN}**`,
                        `Total records: **${history.length}**${filter !== 'ALL' ? ` (filtered: ${filter})` : ''}`,
                    ].join('\n')
                })
                .setColor(0xe74c3c)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Page ${p}/${totalPages} • ${target.id}` });

                for (const record of slice) {
                    const ts = Math.floor(
                        new Date(record.created_at || record.createdAt || Date.now()).getTime() / 1000
                    );
                    const emoji = ACTION_EMOJI[record.action] ?? '📌';
                    const modId = record.moderator_id || record.moderatorId;
                    const statusTag = record.active === false ? ' ~~revoked~~' : '';
                    const durationStr = record.duration_minutes
                        ? ` | Duration: **${formatDuration(record.duration_minutes)}**`
                        : '';

                    embed.addFields({
                        name: `${emoji} ${record.action}${statusTag} — <t:${ts}:d>`,
                        value: [
                            `**Reason:** ${record.reason || 'No reason provided'}`,
                            `**Moderator:** <@${modId}> | <t:${ts}:R>${durationStr}`,
                            record.case_id || record.caseId ? `**Case:** #${record.case_id || record.caseId}` : ''
                        ].filter(Boolean).join('\n'),
                        inline: false
                    });
                }

                return embed;
            };

            const buildRow = (p) => {
                const row = new ActionRowBuilder();
                row.addComponents(
                    new ButtonBuilder().setCustomId('hist_prev').setLabel('⬅ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
                    new ButtonBuilder().setCustomId('hist_page').setLabel(`${p}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('hist_next').setLabel('Next ➡').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages),
                );
                return row;
            };

            const msg = await interaction.editReply({
                embeds: [buildEmbed(page)],
                components: totalPages > 1 ? [buildRow(page)] : []
            });

            if (totalPages <= 1) return;

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120_000,
                filter: btn => btn.user.id === interaction.user.id
            });

            collector.on('collect', async btn => {
                await btn.deferUpdate();
                if (btn.customId === 'hist_prev' && page > 1) page--;
                else if (btn.customId === 'hist_next' && page < totalPages) page++;
                await btn.editReply({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
            });

            collector.on('end', async () => {
                const disabledRow = buildRow(page);
                disabledRow.components.forEach(b => b.setDisabled(true));
                msg.edit({ components: [disabledRow] }).catch(() => {});
            });

        } catch (error) {
            logger.error('History command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(error.userMessage || 'Failed to retrieve punishment history.')]
            });
        }
    }
};

function formatDuration(minutes) {
    if (minutes % 10080 === 0) return `${minutes / 10080}w`;
    if (minutes % 1440  === 0) return `${minutes / 1440}d`;
    if (minutes % 60    === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
}
