import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import {
  isPurgeOwner,
  canPurgeChannel,
  isPurgeConfirmationExpired,
  runPurge,
} from '../services/moderation/channelPurgeService.js';

async function denyNonOwner(interaction) {
  if (isPurgeOwner(interaction.user.id)) return false;
  await interaction.reply({ content: '🚫 Owner Only', flags: MessageFlags.Ephemeral }).catch(() => {});
  return true;
}

const purgeConfirmHandler = {
  name: 'purge_confirm',
  async execute(interaction, client, args = []) {
    if (await denyNonOwner(interaction)) return;
    const [channelId, expiresAt, limitArg] = args;
    const channel = interaction.channel;

    if (channel?.id !== channelId || !canPurgeChannel(channel)) {
      await interaction.reply({ content: '❌ Text Channels Only', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    if (isPurgeConfirmationExpired(expiresAt)) {
      await interaction.update({ content: '⌛ انتهت مهلة التأكيد. اكتب `purge` من جديد.', components: [] }).catch(() => {});
      return;
    }

    await interaction.deferUpdate().catch(() => {});
    try {
      const limit = Number(limitArg) > 0 ? Number(limitArg) : null;
      await runPurge(channel, { client, guild: interaction.guild, executor: interaction.user, limit });
    } catch (error) {
      logger.error('Purge confirm error:', error);
      await channel.send('❌ Can\'t Purge (Missing Permission)').catch(() => {});
    }
  },
};

const purgeCancelHandler = {
  name: 'purge_cancel',
  async execute(interaction) {
    if (await denyNonOwner(interaction)) return;
    // Ephemeral prompts (from /purge) can't be deleted, so they are just closed.
    const removed = await interaction.message.delete().then(() => true).catch(() => false);
    if (!removed) await interaction.update({ content: '❎ Cancelled', components: [] }).catch(() => {});
  },
};

export { purgeConfirmHandler, purgeCancelHandler };
