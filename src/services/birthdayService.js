import { getGuildConfig } from './guildConfig.js';

/**
 * Check for birthdays across all guilds and send birthday messages
 * @param {Object} client - The Discord client
 */
export async function checkBirthdays(client) {
  const today = new Date();
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();

  console.log(`🎂 Running daily birthday check for UTC: ${currentMonth}/${currentDay}.`);

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const config = await getGuildConfig(client, guildId);
      const { birthdayChannelId, birthdayRoleId } = config;

      if (!birthdayChannelId || !birthdayRoleId) {
        console.log(`Skipping birthday check for ${guild.name}: Missing channel or role config.`);
        continue;
      }

      const channel = await guild.channels.fetch(birthdayChannelId).catch(() => null);
      if (!channel) continue;

      // Role cleanup from yesterday
      const trackingKey = `bday-role-tracking-${guildId}`;
      const trackingData = (await client.db.get(trackingKey)) || {};
      const updatedTrackingData = { ...trackingData };

      for (const userId of Object.keys(trackingData)) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member && member.roles.cache.has(birthdayRoleId)) {
            await member.roles.remove(birthdayRoleId, "Birthday role expired");
          }
          delete updatedTrackingData[userId];
        } catch (error) {
          console.error(`Error removing birthday role from ${userId}:`, error);
        }
      }
      
      if (Object.keys(updatedTrackingData).length !== Object.keys(trackingData).length) {
        await client.db.set(trackingKey, updatedTrackingData);
      }

      // Check for birthdays today
      const birthdaysKey = `birthdays:${guildId}`;
      const birthdays = (await client.db.get(birthdaysKey)) || {};
      
      const birthdayMembers = [];
      for (const [userId, userData] of Object.entries(birthdays)) {
        if (userData.month === currentMonth && userData.day === currentDay) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            birthdayMembers.push(member);
            try {
              await member.roles.add(birthdayRoleId, "Happy Birthday! 🎉");
              updatedTrackingData[userId] = true;
            } catch (error) {
              console.error(`Error adding birthday role to ${member.user.tag}:`, error);
            }
          }
        }
      }

      if (birthdayMembers.length > 0) {
        await client.db.set(trackingKey, updatedTrackingData);
        const mentionList = birthdayMembers.map(m => m.toString()).join(', ');
        
        await channel.send({
          embeds: [{
            title: '🎉 Happy Birthday! 🎂',
            description: `A very happy birthday to ${mentionList}! Wishing you an amazing day! 🎈`,
            color: 0xff69b4,
            footer: { text: 'Birthday Bot' },
            timestamp: new Date()
          }]
        });
      }
    } catch (error) {
      console.error(`Error processing birthdays for guild ${guildId}:`, error);
    }
  }
}
