import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isBotOwner, getBotMessage } from '../../config/bot.js';
import {
    getFishingEvent,
    startFishingEvent,
    stopFishingEvent,
} from '../../services/fishingEventService.js';

// Ubah sisa waktu jadi teks yang enak dibaca.
function formatRemaining(endsAt) {
    if (!endsAt) {
        return 'sampai dihentikan manual';
    }

    const remainingMs = Math.max(0, endsAt - Date.now());
    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('fishevent')
        .setDescription('Owner-only: manage the global fishing luck event')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a global fishing luck event for every server')
                .addIntegerOption(option =>
                    option
                        .setName('multiplier')
                        .setDescription('Luck multiplier applied to /fish and /netting (e.g. 8 = 8x luck)')
                        .setRequired(true)
                        .setMinValue(2)
                        .setMaxValue(100)
                )
                .addIntegerOption(option =>
                    option
                        .setName('minutes')
                        .setDescription('How long the event runs in minutes (0 = until stopped). Default: 60')
                        .setRequired(false)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop the global fishing luck event')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show the current global fishing event')
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        // Command ini khusus owner bot, jadi digate manual (bukan izin guild).
        if (!isBotOwner(interaction.user.id)) {
            throw createError(
                'Fishing event command used by non-owner',
                ErrorTypes.PERMISSION,
                getBotMessage('noPermission'),
                { userId: interaction.user.id }
            );
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            const multiplier = interaction.options.getInteger('multiplier');
            const minutes = interaction.options.getInteger('minutes');
            const durationMinutes = minutes ?? 60;

            const event = await startFishingEvent({
                multiplier,
                durationMinutes,
                startedBy: interaction.user.id,
            });

            const embed = successEmbed(
                'Fishing Event Started',
                `Global luck boost **x${event.multiplier}** is now active for **every server**.\n` +
                `Duration: **${formatRemaining(event.endsAt)}**.`
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'stop') {
            const existing = await getFishingEvent();
            await stopFishingEvent();

            const embed = existing
                ? successEmbed('Fishing Event Stopped', `The **x${existing.multiplier}** global luck boost has ended.`)
                : warningEmbed('Fishing Event', 'There is no active fishing event to stop.');

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        // status
        const event = await getFishingEvent();
        const embed = event
            ? createEmbed({
                title: 'Fishing Event Status',
                description:
                    `**Active:** yes\n` +
                    `**Multiplier:** x${event.multiplier}\n` +
                    `**Remaining:** ${formatRemaining(event.endsAt)}`,
                color: '#F1C40F',
            })
            : createEmbed({
                title: 'Fishing Event Status',
                description: 'No fishing event is currently active.',
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fishevent' })
};
