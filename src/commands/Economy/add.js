import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, formatCurrency } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Use Unicode escape to ensure the emoji is preserved in all environments
const MONEY_EMOJI = '\u{1F4B0}';

export default {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Administrative add actions (admin only)')
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription("Add money to a user's balance")
        .addUserOption(opt => opt.setName('user').setDescription('User to update').setRequired(true))
        .addStringOption(opt => opt.setName('amount').setDescription('Amount to add (e.g., 100m)').setRequired(true))
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Where to add the money')
            .addChoices(
              { name: 'wallet', value: 'wallet' },
              { name: 'bank', value: 'bank' }
            )
        )
    ),

  execute: withErrorHandling(async (interaction, config, client) => {
    // permission check: require Manage Guild or Administrator
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

      const result = await addMoney(client, guildId, target.id, amountStr, type, { bypassLimits: true });

      if (!result || result.success === false) {
        const errMsg = result && result.error ? result.error : 'Failed to add money';
        await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(errMsg)] });
        return;
      }

      const afterValue = result.newBalance;
      const fieldName = type === 'bank' ? 'Bank' : 'Wallet';

      const embed = createEmbed({
        title: `${MONEY_EMOJI} Balance Updated`,
        description: `Added ${MONEY_EMOJI} ${formatCurrency(amountStr, { short: true, noSymbol: true })} gp to ${target.username}'s ${fieldName}`,
      })
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: `Before (${fieldName})`, value: `${MONEY_EMOJI} ${formatCurrency((type === 'bank' ? before.bank : before.wallet) || 0, { short: true, noSymbol: true })} gp`, inline: true },
          { name: `After (${fieldName})`, value: `${MONEY_EMOJI} ${formatCurrency(afterValue || 0, { short: true, noSymbol: true })} gp`, inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
  }, { command: 'add' })
};
