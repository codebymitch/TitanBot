import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, removeMoney, addMoney, formatCurrency, parseHumanAmount } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

// Unicode money emoji fallback
const MONEY_EMOJI = '\u{1F4B0}';

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer to transfer gp to another member (recipient must accept)')
    .addUserOption(opt => opt.setName('to').setDescription('Member to send gp to').setRequired(true))
    .addStringOption(opt => opt.setName('amount').setDescription('Amount to offer (e.g. 100m)').setRequired(true)),

  execute: withErrorHandling(async (interaction, config, client) => {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    // Prevent mutating operations when the database is degraded/unavailable
    if (!client.db || typeof client.db.isAvailable !== 'function' || !client.db.isAvailable()) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Database is degraded — write operations are disabled. Please fix PostgreSQL or enable a persistent DB and restart the bot.')] });
      return;
    }

    const target = interaction.options.getUser('to', true);
    const amountStr = interaction.options.getString('amount', true);
    const guildId = interaction.guildId;
    const sender = interaction.user;

    // Basic validations
    if (target.bot) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('You cannot trade with bots.')] });
      return;
    }

    if (target.id === sender.id) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('You cannot trade to yourself.')] });
      return;
    }

    // Parse amount
    const parsedAmount = parseHumanAmount(amountStr);
    if (parsedAmount === null || !isFinite(parsedAmount) || parsedAmount <= 0) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Amount must be a valid positive number (e.g. 100m, 1k).')] });
      return;
    }

    // Load sender balance and check funds now (to avoid pointless offers)
    const senderData = await getEconomyData(client, guildId, sender.id) || { wallet: 0, bank: 0 };
    if ((senderData.wallet || 0) < parsedAmount) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Insufficient funds in wallet to create this offer.')] });
      return;
    }

    // Build offer embed with accept/decline buttons
    const offerEmbed = createEmbed({
      title: `${MONEY_EMOJI} Trade Offer`,
      description: `${sender.tag} is offering to send ${MONEY_EMOJI} ${formatCurrency(parsedAmount, { short: true, noSymbol: true })} gp to ${target.tag}.

${target}, you have 2 minutes to Accept or Decline.`,
    })
      .addFields(
        { name: 'From', value: `${sender.tag} (${sender.id})`, inline: true },
        { name: 'To', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Amount', value: `${MONEY_EMOJI} ${formatCurrency(parsedAmount, { short: true, noSymbol: true })} gp`, inline: true }
      )
      .setFooter({ text: `Offered by ${sender.tag}`, iconURL: sender.displayAvatarURL() });

    const acceptId = `trade:accept:${interaction.id}`;
    const declineId = `trade:decline:${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    // Send offer as a fresh follow-up message so component tokens are tied to a new message
    let offerMessage;
    try {
      offerMessage = await interaction.followUp({ embeds: [offerEmbed], components: [row], fetchReply: true });
    } catch (err) {
      logger.error('Failed to send followUp for trade offer, falling back to editReply', err);
      await InteractionHelper.safeEditReply(interaction, { embeds: [offerEmbed], components: [row] }).catch(() => {});
      offerMessage = await interaction.fetchReply().catch(() => null);
    }

    if (!offerMessage) {
      // If we couldn't obtain a message to attach a collector to, inform and exit
      await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Failed to post trade offer message. Please try again later.')] }).catch(() => {});
      return;
    }

    // Create a collector on the posted message so we can provide better feedback to non-recipients
    const collector = offerMessage.createMessageComponentCollector({ time: 2 * 60 * 1000 });

    collector.on('collect', async (i) => {
      try {
        if (!i || !i.user) return;

        // If someone other than the intended recipient clicks, show a helpful ephemeral reply
        if (i.user.id !== target.id) {
          await i.reply({ content: `Only the recipient (${target.tag}) can accept this offer.`, ephemeral: true }).catch(() => {});
          return;
        }

        // Disable buttons immediately to prevent double clicks
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger).setDisabled(true)
        );

        if (i.customId === declineId) {
          const declineEmbed = createEmbed({ title: 'Trade Declined', description: `${target.tag} declined the trade offer from ${sender.tag}.` });
          await i.update({ embeds: [declineEmbed], components: [disabledRow] }).catch(async (err) => {
            logger.warn('Failed to update decline response', err);
            await offerMessage.edit({ embeds: [createEmbed({ title: 'Trade Declined', description: `${target.tag} declined the trade offer.` })], components: [disabledRow] }).catch(() => {});
          });
          collector.stop('declined');
          return;
        }

        // Accept path
        await i.deferUpdate().catch(() => {});

        // Re-validate sender still has funds
        const latestSender = await getEconomyData(client, guildId, sender.id) || { wallet: 0, bank: 0 };
        if ((latestSender.wallet || 0) < parsedAmount) {
          const failEmbed = createEmbed({ title: 'Trade Failed', description: `Trade could not be completed because ${sender.tag} no longer has sufficient wallet funds.` });
          await offerMessage.edit({ embeds: [failEmbed], components: [disabledRow] }).catch(() => {});
          collector.stop('insufficient');
          return;
        }

        // Attempt to remove from sender
        const removal = await removeMoney(client, guildId, sender.id, parsedAmount, 'wallet');
        if (!removal || removal.success === false) {
          const errMsg = removal && removal.error ? removal.error : 'Failed to remove money from sender.';
          const failEmbed = createEmbed({ title: 'Trade Failed', description: `Failed to withdraw funds from ${sender.tag}: ${errMsg}` });
          await offerMessage.edit({ embeds: [failEmbed], components: [disabledRow] }).catch(() => {});
          collector.stop('removal_failed');
          return;
        }

        // Attempt to add to recipient
        const addition = await addMoney(client, guildId, target.id, parsedAmount, 'wallet');
        if (!addition || addition.success === false) {
          // Try to refund sender
          logger.warn('[ECONOMY] Addition to recipient failed during accepted trade, attempting refund', { to: target.id, from: sender.id, amount: parsedAmount, addition });
          const refund = await addMoney(client, guildId, sender.id, parsedAmount, 'wallet', { bypassLimits: true }).catch(() => null);
          const refundMsg = refund && refund.success ? ' Sender has been refunded.' : ' Refund failed — contact an admin.';
          const errText = (addition && addition.error) ? addition.error + refundMsg : `Failed to add funds to recipient.${refundMsg}`;
          const failEmbed = createEmbed({ title: 'Trade Failed', description: errText });
          await offerMessage.edit({ embeds: [failEmbed], components: [disabledRow] }).catch(() => {});
          collector.stop('addition_failed');
          return;
        }

        // Success: fetch final balances
        const afterSender = await getEconomyData(client, guildId, sender.id) || { wallet: 0, bank: 0 };
        const afterTarget = await getEconomyData(client, guildId, target.id) || { wallet: 0, bank: 0 };

        const successEmbed = createEmbed({
          title: `${MONEY_EMOJI} Trade Completed`,
          description: `${target.tag} accepted ${sender.tag}'s offer of ${MONEY_EMOJI} ${formatCurrency(parsedAmount, { short: true, noSymbol: true })} gp.`,
        })
          .addFields(
            { name: 'From', value: `${sender.tag} (${sender.id})`, inline: true },
            { name: 'To', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Total (Sender)', value: `${MONEY_EMOJI} ${formatCurrency((afterSender.wallet || 0) + (afterSender.bank || 0), { short: true, noSymbol: true })} gp`, inline: true },
            { name: 'Total (Recipient)', value: `${MONEY_EMOJI} ${formatCurrency((afterTarget.wallet || 0) + (afterTarget.bank || 0), { short: true, noSymbol: true })} gp`, inline: true },
          )
          .setFooter({ text: `Requested by ${sender.tag}`, iconURL: sender.displayAvatarURL() });

        await offerMessage.edit({ embeds: [successEmbed], components: [disabledRow] }).catch((err) => {
          logger.error('Failed to send trade success embed', err);
        });

        logger.info('[ECONOMY] Trade completed', { from: sender.id, to: target.id, amount: parsedAmount });
        collector.stop('completed');
      } catch (err) {
        logger.error('Error handling trade collector collect event', err);
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger).setDisabled(true)
          );
          const failEmbed = createEmbed({ title: 'Trade Error', description: 'An unexpected error occurred while processing the trade. Buttons have been disabled.' });
          await offerMessage.edit({ embeds: [failEmbed], components: [disabledRow] });
        } catch (editErr) {
          logger.error('Failed to disable buttons after collector error', editErr);
        }
        collector.stop('error');
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        // edit message to show expired and disable buttons
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(acceptId).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(declineId).setLabel('Decline').setStyle(ButtonStyle.Danger).setDisabled(true)
          );
          const expiredEmbed = createEmbed({ title: 'Trade Expired', description: 'The trade offer has expired (no response).' });
          await offerMessage.edit({ embeds: [expiredEmbed], components: [disabledRow] });
        } catch (editErr) {
          logger.warn('Failed to mark trade offer expired on collector end', editErr);
        }
      }
    });

  }, { command: 'trade' })
};
