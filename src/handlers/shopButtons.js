import { shopItems } from '../config/shop/items.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { checkRateLimit } from '../utils/rateLimiter.js';





const shopPurchaseHandler = {
  name: 'shop_buy',
  async execute(interaction, client, args) {
    try {
      if (!interaction.inGuild()) {
        await interaction.reply({
          embeds: [errorEmbed('Guild Only', 'This action can only be used in a server.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const rateLimitKey = `${interaction.user.id}:shop_buy`;
      const allowed = await checkRateLimit(rateLimitKey, 5, 30000);
      if (!allowed) {
        await interaction.reply({
          embeds: [errorEmbed('Rate Limited', 'You are purchasing too quickly. Please wait a few seconds and try again.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const itemId = args?.[0];

      if (!itemId) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'Invalid item ID.')],
        });
        return;
      }

      
      const item = shopItems.find(i => i.id === itemId);

      if (!item) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Item', `The item \`${itemId}\` does not exist in the shop.`)],
        });
        return;
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const quantity = 1; 

      const totalCost = item.price * quantity;

      
      const userData = await getEconomyData(client, guildId, userId);

      
      if (userData.wallet < totalCost) {
        await interaction.editReply({
          embeds: [errorEmbed(
            'Insufficient Funds',
            `You need **$${totalCost.toLocaleString()}** to purchase **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}** in cash.\n\nUse the **\`/work\`** command to earn more money.`
          )],
        });
        return;
      }

      
      if (item.type === 'role' && itemId === 'premium_role') {
        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        if (!PREMIUM_ROLE_ID) {
          await interaction.editReply({
            embeds: [errorEmbed('Not Configured', 'The **Premium Shop Role** has not been configured by a server administrator.')],
          });
          return;
        }

        if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
          await interaction.editReply({
            embeds: [errorEmbed('Already Own', `You already have the **${item.name}** role.`)],
          });
          return;
        }

        
        try {
          await interaction.member.roles.add(PREMIUM_ROLE_ID, `Purchased from shop`);
        } catch (error) {
          logger.error('Error adding premium role:', error);
          await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to add the role. Please contact an administrator.')],
          });
          return;
        }
      }

      
      if (!userData.inventory) {
        userData.inventory = {};
      }

      if (!userData.inventory[itemId]) {
        userData.inventory[itemId] = 0;
      }

      userData.inventory[itemId] += quantity;
      userData.wallet -= totalCost;

      
      await setEconomyData(client, guildId, userId, userData);

      
      await interaction.editReply({
        embeds: [successEmbed(
          `✅ **Purchase Successful!**\n\n` +
          `You bought **${quantity}x ${item.name}** for **$${totalCost.toLocaleString()}**\n\n` +
          `**New Balance:** $${userData.wallet.toLocaleString()}`,
          '🛒 Shop Purchase'
        )],
      });

      logger.info(`User ${interaction.user.tag} (${userId}) purchased ${quantity}x ${item.id} for $${totalCost} in guild ${guildId}`);

    } catch (error) {
      logger.error('Shop purchase button handler error:', error);

      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while processing your purchase. Please try again later.')],
      });
    }
  }
};

export { shopPurchaseHandler };



