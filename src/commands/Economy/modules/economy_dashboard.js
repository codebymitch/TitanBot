import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    LabelBuilder,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { adjustCC, getLeaderboard } from '../../../services/cc/ccService.js';
import { CC, formatCC, gamesBotDailyCap, gamesBotReward, soloDailyCap, capText } from '../../../config/cc.js';

// Staff dashboard for Chaos Credits: server totals plus adding/removing CC by hand (corrections,
// event prizes). Members themselves only get CC from games.

async function buildDashboardEmbed(guild, client) {
    let total = 0;
    let holders = 0;
    try {
        const board = await getLeaderboard(client, guild.id);
        holders = board.length;
        total = board.reduce((sum, row) => sum + row.cc, 0);
    } catch (error) {
        logger.error('Error calculating CC stats:', error);
    }

    return new EmbedBuilder()
        .setTitle(`${CC.emoji} ${CC.name} Dashboard`)
        .setDescription(`Manage ${CC.short} for **${guild.name}**.\nMembers earn ${CC.short} only from games.`)
        .setColor(getColor('economy'))
        .addFields(
            { name: `${CC.emoji} Total in circulation`, value: `\`${total.toLocaleString('en-US')} ${CC.short}\``, inline: true },
            { name: '👥 Members with CC', value: `\`${holders.toLocaleString('en-US')}\``, inline: true },
            { name: '📊 Average', value: `\`${(holders ? Math.floor(total / holders) : 0).toLocaleString('en-US')} ${CC.short}\``, inline: true },
            { name: '🍀 Clover group win / answer win / daily cap', value: `\`${gamesBotReward('group', guild.id)} / ${gamesBotReward('answer', guild.id)} / ${capText(gamesBotDailyCap())}\``, inline: true },
            { name: '🙋 Solo win / daily cap', value: `\`${CC.solo.win} / ${capText(soloDailyCap())}\``, inline: true },
        );
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`economy_dashboard_${guildId}`)
        .setPlaceholder('Select an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel(`Add ${CC.short}`).setDescription(`Give ${CC.short} to a member`).setValue('add').setEmoji('➕'),
            new StringSelectMenuOptionBuilder().setLabel(`Remove ${CC.short}`).setDescription(`Take ${CC.short} from a member`).setValue('remove').setEmoji('➖'),
        );
}

async function refreshDashboard(rootInteraction, guild, client) {
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(guild, client)],
        components: [new ActionRowBuilder().addComponents(buildSelectMenu(guild.id))],
    }).catch(() => {});
}

async function handleAdjust(selectInteraction, rootInteraction, guild, client, direction) {
    const modalId = `economy_${direction}_cc_${guild.id}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`${direction === 'add' ? 'Add' : 'Remove'} ${CC.short}`);
    const userLabel = new LabelBuilder()
        .setLabel('Member')
        .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('target_user').setPlaceholder('Select a member...').setMinValues(1).setMaxValues(1).setRequired(true));
    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel(`Amount of ${CC.short}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setMinLength(1)
        .setMaxLength(9)
        .setRequired(true);
    modal.addLabelComponents(userLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

    await selectInteraction.showModal(modal);
    const submitted = await selectInteraction
        .awaitModalSubmit({ filter: (i) => i.customId === modalId && i.user.id === selectInteraction.user.id, time: 120_000 })
        .catch(() => null);
    if (!submitted) return;

    const userId = submitted.fields.getField('target_user').values[0];
    const amount = Number(submitted.fields.getTextInputValue('amount').trim());
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Amount must be a positive whole number.' });
        return;
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Pick a member of this server (not a bot).' });
        return;
    }

    const { balance } = await adjustCC(client, guild.id, userId, direction === 'add' ? amount : -amount, submitted.user.id);
    await submitted.reply({
        embeds: [successEmbed(`${CC.short} ${direction === 'add' ? 'added' : 'removed'}`, `${direction === 'add' ? 'Added' : 'Removed'} ${formatCC(amount)} ${direction === 'add' ? 'to' : 'from'} ${member}.\n**New balance:** ${formatCC(balance)}`)],
        flags: MessageFlags.Ephemeral,
    });
    await refreshDashboard(rootInteraction, guild, client);
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        const guild = interaction.guild;
        try {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [await buildDashboardEmbed(guild, client)],
                components: [new ActionRowBuilder().addComponents(buildSelectMenu(guild.id))],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === interaction.user.id && i.customId === `economy_dashboard_${guild.id}`,
                time: 600_000,
            });

            collector.on('collect', async (selectInteraction) => {
                try {
                    await handleAdjust(selectInteraction, interaction, guild, client, selectInteraction.values[0]);
                } catch (error) {
                    logger.error('Economy dashboard error:', error);
                    if (!selectInteraction.replied && !selectInteraction.deferred) await selectInteraction.deferUpdate().catch(() => {});
                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: error instanceof TitanBotError ? error.userMessage : 'An unexpected error occurred while processing your request.',
                    }).catch(() => {});
                }
            });

            collector.on('end', async (_collected, reason) => {
                if (reason !== 'time') return;
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder().setTitle('Dashboard Timed Out').setDescription('Run the command again to continue.').setColor(getColor('error'))],
                    components: [],
                }).catch(() => {});
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in economy_dashboard:', error);
            throw new TitanBotError(`Economy dashboard failed: ${error.message}`, ErrorTypes.UNKNOWN, 'Failed to open the economy dashboard.');
        }
    },
};
