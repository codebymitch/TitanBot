import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, removeMoney, formatCurrency } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Use Unicode escape to ensure the emoji is preserved in all environments
const MONEY_EMOJI = '\u{1F4B0}';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Administrative remove actions (admin only)')
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription("Remove money from a user's balance")
        .addUserOption(opt => opt.setName('user').setDescription('User to update').setRequired(true))
        .addStringOption(opt => opt.setName('amount').setDescription('Amount to remove (e.g., 50m)').setRequired(true))
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Where to remove the money from')
            .addChoices(
              { name: 'wallet', value: 'wallet' },
              { name: 'bank', value: 'bank' }
            )
        )
    ),

  execute: withErrorHandling(async (interaction, config, client) => {
    // permission check: require Administrator or Manage Guild
    const perms = interaction.memberPermissions;
    const allowed = perms?.has?.(PermissionFlagsBits.Administrator) || perms?.has?.(PermissionFlagsBits.ManageGuild);
    if (!allowed) {
      throw createError('Unauthorized', ErrorTypes.AUTH, 'You do not have permission to use this command.');
    }

    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'balance') {
      const target = interaction.options.getUser('user', true);
      const amountStr = interaction.options.getString('amount', true);
      const type = interaction.options.getString('type') || 'wallet';
      const guildId = interaction.guildId;

      if (target.bot) {
        await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Bots do not have balances.')] });
        return;
      }

      const before = await getEconomyData(client, guildId, target.id) || { wallet: 0, bank: 0 };

      const result = await removeMoney(client, guildId, target.id, amountStr, type, { bypassLimits: true });

      if (!result || result.success === false) {
        const errMsg = result && result.error ? result.error : 'Failed to remove money';
        let body = errMsg;
        if (result && result.current !== undefined) {
          body += ` (current: ${MONEY_EMOJI} ${formatCurrency(result.current, { short: true, noSymbol: true })} gp${result.required ? `, required: ${MONEY_EMOJI} ${formatCurrency(result.required, { short: true, noSymbol: true })} gp` : ''})`;
        }
        await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(body)] });
        return;
      }

      const afterValue = result.newBalance;
      const fieldName = type === 'bank' ? 'Bank' : 'Wallet';

      const embed = createEmbed({
        title: `${MONEY_EMOJI} Balance Updated`,
        description: `Removed ${MONEY_EMOJI} ${formatCurrency(amountStr, { short: true, noSymbol: true })} gp from ${target.username}'s ${fieldName}`,
      })
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: `Before (${fieldName})`, value: `${MONEY_EMOJI} ${formatCurrency((type === 'bank' ? before.bank : before.wallet) || 0, { short: true, noSymbol: true })} gp`, inline: true },
          { name: `After (${fieldName})`, value: `${MONEY_EMOJI} ${formatCurrency(afterValue || 0, { short: true, noSymbol: true })} gp`, inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
  }, { command: 'remove' })
};
