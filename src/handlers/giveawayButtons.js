import { giveawayEmbed, giveawayButtons, getGuildGiveaways, saveGiveaway, pickWinners, isGiveawayEnded } from '../utils/giveaways.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionResponseType } from 'discord.js';

export const giveawayJoinHandler = {
  customId: 'giveaway_join',
  async execute(interaction, client) {
    try {
      const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
      const giveaway = guildGiveaways[interaction.message.id];

      if (!giveaway) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway is no longer active.')],
flags: 64
        });
      }

      const endedByTime = isGiveawayEnded(giveaway);
      const endedByFlag = giveaway.ended || giveaway.isEnded;
      if (endedByFlag && !endedByTime) {
        giveaway.ended = false;
        giveaway.isEnded = false;
        await saveGiveaway(client, interaction.guildId, giveaway);
      }

      if (endedByTime || endedByFlag) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway has already ended.')],
flags: 64
        });
      }

      const participants = giveaway.participants || [];
      const userId = interaction.user.id;

      if (participants.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed('Already Entered', 'You have already entered this giveaway!')],
flags: 64
        });
      }

      participants.push(userId);
      giveaway.participants = participants;

      await saveGiveaway(client, interaction.guildId, giveaway);

      const updatedEmbed = giveawayEmbed(giveaway, 'active');
      const updatedRow = giveawayButtons(false);

      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [updatedRow]
      });

      await interaction.reply({
        embeds: [successEmbed('Success!', 'You have entered the giveaway! 🎉')],
flags: 64
      });

    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Failed to join the giveaway. Please try again.')],
flags: 64
      });
    }
  }
};

export const giveawayEndHandler = {
  customId: 'giveaway_end',
  async execute(interaction, client) {
    try {
      const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
      const giveaway = guildGiveaways[interaction.message.id];

      if (!giveaway) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway is no longer active.')],
flags: 64
        });
      }

      if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway has already ended.')],
flags: 64
        });
      }

      const participants = giveaway.participants || [];
      const winners = pickWinners(participants, giveaway.winnerCount);

      giveaway.ended = true;
      giveaway.isEnded = true;
      giveaway.winners = winners;
      giveaway.endedAt = new Date().toISOString();

      await saveGiveaway(client, interaction.guildId, giveaway);

      const updatedEmbed = giveawayEmbed(giveaway, 'ended', winners);
      const updatedRow = giveawayButtons(true);

      await interaction.message.edit({
        content: '🎉 **GIVEAWAY ENDED** 🎉',
        embeds: [updatedEmbed],
        components: [updatedRow]
      });

      await interaction.reply({
        embeds: [successEmbed('Giveaway Ended', `The giveaway has been ended and ${winners.length} winner(s) have been selected!`)],
flags: 64
      });

    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Failed to end the giveaway. Please try again.')],
flags: 64
      });
    }
  }
};

export const giveawayRerollHandler = {
  customId: 'giveaway_reroll',
  async execute(interaction, client) {
    try {
      const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
      const giveaway = guildGiveaways[interaction.message.id];

      if (!giveaway) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway is no longer active.')],
flags: 64
        });
      }

      if (!giveaway.ended && !giveaway.isEnded) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'This giveaway has not ended yet.')],
flags: 64
        });
      }

      const participants = giveaway.participants || [];
      const newWinners = pickWinners(participants, giveaway.winnerCount);

      giveaway.winners = newWinners;
      giveaway.rerolledAt = new Date().toISOString();

      await saveGiveaway(client, interaction.guildId, giveaway);

      const updatedEmbed = giveawayEmbed(giveaway, 'reroll', newWinners);
      const updatedRow = giveawayButtons(true);

      await interaction.message.edit({
        content: '🔄 **GIVEAWAY REROLLED** 🔄',
        embeds: [updatedEmbed],
        components: [updatedRow]
      });

      await interaction.reply({
        embeds: [successEmbed('Giveaway Rerolled', `New winner(s) have been selected!`)],
flags: 64
      });

    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Failed to reroll the giveaway. Please try again.')],
flags: 64
      });
    }
  }
};



