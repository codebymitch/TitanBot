import { shopItems } from '../config/shop/items.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { withErrorHandling, createError, ErrorTypes } from '../utils/errorHandler.js';

/**
 * Handle shop purchase button clicks
 * Button ID format: shop_buy:item_id
 */
const shopPurchaseHandler = {
  name: 'shop_buy',
  async execute(interaction, client, args) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const itemId = args[0];

      if (!itemId) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'Invalid item ID.')],
        });
        return;
      }

      // Find the item in the shop
      const item = shopItems.find(i => i.id === itemId);

      if (!item) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Item', `The item \`${itemId}\` does not exist in the shop.`)],
        });
        return;
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;
      const quantity = 1; // Default quantity for button purchase

      const totalCost = item.price * quantity;

      // Get user economy data
      const userData = await getEconomyData(client, guildId, userId);

      // Check if user has enough money
      if (userData.wallet < totalCost) {
        await interaction.editReply({
          embeds: [errorEmbed(
            'Insufficient Funds',
            `You need **$${totalCost.toLocaleString()}** to purchase **${item.name}**, but you only have **$${userData.wallet.toLocaleString()}** in cash.\n\nUse the **\`/work\`** command to earn more money.`
          )],
        });
        return;
      }

      // Handle role purchases
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

        // Add role to user
        try {
          await interaction.member.roles.add(PREMIUM_ROLE_ID, `Purchased from shop`);
        } catch (error) {
          console.error('Error adding premium role:', error);
          await interaction.editReply({
            embeds: [errorEmbed('Error', 'Failed to add the role. Please contact an administrator.')],
          });
          return;
        }
      }

      // Handle inventory items
      if (!userData.inventory) {
        userData.inventory = {};
      }

      if (!userData.inventory[itemId]) {
        userData.inventory[itemId] = 0;
      }

      userData.inventory[itemId] += quantity;
      userData.wallet -= totalCost;

      // Save updated data
      await setEconomyData(client, guildId, userId, userData);

      // Success message
      await interaction.editReply({
        embeds: [successEmbed(
          `✅ **Purchase Successful!**\n\n` +
          `You bought **${quantity}x ${item.name}** for **$${totalCost.toLocaleString()}**\n\n` +
          `**New Balance:** $${userData.wallet.toLocaleString()}`,
          '🛒 Shop Purchase'
        )],
      });

      console.log(`✅ User ${interaction.user.tag} (${userId}) purchased ${quantity}x ${item.id} for $${totalCost} in guild ${guildId}`);

    } catch (error) {
      console.error('Shop purchase button handler error:', error);

      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while processing your purchase. Please try again later.')],
      });
    }
  }
};

export { shopPurchaseHandler };



