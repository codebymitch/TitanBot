import { pickWinners } from '../utils/giveaways.js';

/**
 * Check for ended giveaways across all guilds and process them
 * @param {Object} client - The Discord client
 */
export async function checkGiveaways(client) {
  try {
    if (!client.db || typeof client.db.get !== "function") {
return;
    }

    for (const [guildId, guild] of client.guilds.cache) {
      const giveawayDbKey = `guild:${guildId}:giveaways`;
      const giveaways = await client.db.get(giveawayDbKey) || {};
      const now = Date.now();
      let updated = false;

      for (const [messageId, giveaway] of Object.entries(giveaways)) {
        if (!giveaway || typeof giveaway !== 'object') {
          continue;
        }

        const endTime = giveaway.endsAt || giveaway.endTime;
        if (!endTime) {
          continue;
        }

        if (endTime <= now && !giveaway.ended) {
          giveaway.ended = true;
          updated = true;
          
          try {
            const channel = await guild.channels.fetch(giveaway.channelId);
            if (!channel) continue;
            
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) continue;
            
            const participants = giveaway.participants || [];
            const winners = pickWinners(participants, giveaway.winnerCount);
            
            const winnerMentions = winners.length > 0 
              ? winners.map(id => `<@${id}>`).join(', ')
              : 'No valid entries!';
              
            const embed = message.embeds[0]?.data || {};
            const endedEmbed = {
              ...embed,
              title: '🎉 Giveaway Ended!',
              fields: [
                { name: 'Winners', value: winnerMentions, inline: true },
                { name: 'Entries', value: participants.length.toString(), inline: true },
                { name: 'Prize', value: giveaway.prize || 'Mystery Prize!', inline: true }
              ],
              color: 0xff0000,
              footer: { text: 'Giveaway ended' },
              timestamp: new Date().toISOString()
            };
            
            await message.edit({
              embeds: [endedEmbed],
              components: []
            });
            
            if (winners.length > 0) {
              const winnerAnnouncement = `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**!`;
              await channel.send({ content: winnerAnnouncement });
            }
            
          } catch (error) {
            console.error(`Error ending giveaway ${messageId} in guild ${guildId}:`, error);
          }
        }
      }
      
      if (updated) {
        await client.db.set(giveawayDbKey, giveaways);
      }
    }
  } catch (error) {
    console.error('Error in giveaway check:', error);
  }
}
