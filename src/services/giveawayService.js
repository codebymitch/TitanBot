/**
 * Pick random winners from a list of participants
 * @param {Array} participants - Array of participant IDs
 * @param {number} count - Number of winners to pick
 * @returns {Array} Array of winner IDs
 */
export function pickWinners(participants, count) {
  const shuffled = [...participants].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Check for ended giveaways across all guilds and process them
 * @param {Object} client - The Discord client
 */
export async function checkGiveaways(client) {
  try {
    for (const [guildId, guild] of client.guilds.cache) {
      const giveawayDbKey = `giveaways:${guildId}`;
      const giveaways = await client.db.get(giveawayDbKey) || {};
      const now = Date.now();
      let updated = false;

      for (const [messageId, giveaway] of Object.entries(giveaways)) {
        // Skip invalid giveaway objects
        if (!giveaway || typeof giveaway !== 'object') {
          console.warn(`Invalid giveaway object for message ${messageId} in guild ${guildId}`);
          continue;
        }

        // Check if giveaway has required properties
        if (!giveaway.endsAt) {
          console.warn(`Giveaway ${messageId} in guild ${guildId} missing endsAt property`);
          continue;
        }

        if (giveaway.endsAt <= now && !giveaway.ended) {
          // End the giveaway
          giveaway.ended = true;
          updated = true;
          
          try {
            const channel = await guild.channels.fetch(giveaway.channelId);
            if (!channel) continue;
            
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) continue;
            
            const entries = giveaway.entries || [];
            const winners = pickWinners(entries, giveaway.winnerCount);
            
            // Update the message
            const winnerMentions = winners.length > 0 
              ? winners.map(id => `<@${id}>`).join(', ')
              : 'No valid entries!';
              
            const embed = message.embeds[0]?.data || {};
            const endedEmbed = {
              ...embed,
              title: '🎉 Giveaway Ended!',
              fields: [
                { name: 'Winners', value: winnerMentions, inline: true },
                { name: 'Entries', value: entries.length.toString(), inline: true },
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
            
            // Announce winners
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
