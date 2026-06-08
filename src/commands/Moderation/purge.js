import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from 'discord.js';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete a bulk of messages in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'moderation',

    async execute(interaction, config, client) {
        const inServer = !!interaction.guild;

        if (inServer && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Permission Denied', 'You need the `Manage Messages` permission to purge messages.')],
                flags: [MessageFlags.Ephemeral],
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('purge_count')
            .setTitle(inServer ? 'Delete Messages' : 'Delete Bot Messages');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel(inServer ? 'How many messages to delete? (1–100)' : 'How many bot messages to delete? (1–100)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 10')
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);

        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'purge_count' && i.user.id === interaction.user.id,
            time: 60_000,
        }).catch(() => null);

        if (!modalSubmit) return;

        const amountStr = modalSubmit.fields.getTextInputValue('amount').trim();
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return modalSubmit.reply({
                embeds: [errorEmbed('Invalid Amount', 'Please enter a whole number between 1 and 100.')],
                flags: [MessageFlags.Ephemeral],
            });
        }

        await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

        const rateLimitKey = `purge_${interaction.user.id}`;
        const isAllowed = await checkRateLimit(rateLimitKey, 5, 60_000);
        if (!isAllowed) {
            return modalSubmit.editReply({
                embeds: [warningEmbed('Rate Limited', "You're purging too fast. Please wait a minute before trying again.")],
            });
        }

        const channel = interaction.channel;

        try {
            if (inServer) {
                // ── Server: bulk delete (up to 100, max 14 days old) ──────
                const fetched = await channel.messages.fetch({ limit: amount });
                const deleted = await channel.bulkDelete(fetched, true);
                const deletedCount = deleted.size;

                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: 'Messages Purged',
                        target: `${channel} (${deletedCount} messages)`,
                        executor: `${interaction.user.username} (${interaction.user.id})`,
                        reason: `Deleted ${deletedCount} messages`,
                        metadata: {
                            channelId: channel.id,
                            messageCount: deletedCount,
                            requestedAmount: amount,
                            moderatorId: interaction.user.id,
                        },
                    },
                });

                await modalSubmit.editReply({
                    embeds: [successEmbed('Messages Deleted', `Deleted **${deletedCount}** messages in ${channel}.`)],
                });

                setTimeout(() => modalSubmit.deleteReply().catch(() => {}), 4000);
                logger.info(`Purge: ${deletedCount} messages deleted in ${channel.id} by ${interaction.user.id}`);
            } else {
                // ── DM / Group DM: can only delete the bot's own messages ──
                const fetched = await channel.messages.fetch({ limit: 100 });
                const botMessages = fetched
                    .filter(m => m.author.id === client.user.id)
                    .first(amount);

                let deleted = 0;
                for (const msg of botMessages) {
                    await msg.delete().catch(() => {});
                    deleted++;
                }

                await modalSubmit.editReply({
                    embeds: [successEmbed('Bot Messages Deleted',
                        deleted > 0
                            ? `Deleted **${deleted}** of my recent messages.\n*Note: in DMs/groups bots can only delete their own messages.*`
                            : 'No recent bot messages found to delete.')],
                });

                setTimeout(() => modalSubmit.deleteReply().catch(() => {}), 5000);
            }
        } catch (error) {
            logger.error('Purge command error:', error);
            await modalSubmit.editReply({
                embeds: [errorEmbed('Delete Failed', 'Could not delete messages. Messages older than 14 days cannot be bulk deleted in servers.')],
            });
        }
    },
};
