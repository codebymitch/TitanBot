import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff, loadJourneyConfig } from '../../services/berryRpg.js';
import { getJourneyProgress, getJourneys, processJourneys, saveJourneys } from '../../services/berryTravel.js';
import { calculateTravelDuration, formatShip, getBoats } from '../../services/berryShips.js';

const JOURNEY_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];

function isJourneyLocation(channel) {
  return Boolean(channel?.guildId && !channel.isDMBased?.() && (
    channel.type === ChannelType.GuildForum || channel.isThread?.() || channel.isTextBased?.()
  ));
}

function locationName(channel) {
  if (channel.isThread?.()) {
    const parentName = channel.parent?.name || 'Forum';
    return parentName + ' / ' + channel.name;
  }
  return channel.name;
}

export default {
  data: new SlashCommandBuilder()
    .setName('boat')
    .setDescription('Start or check a journey between server locations.')
    .addStringOption(option => option.setName('action').setDescription('Journey action').setRequired(true)
      .addChoices({ name: 'Start journey', value: 'start' }, { name: 'Check progress', value: 'status' }, { name: 'Confirm manual departure (staff)', value: 'confirm' }))
    .addStringOption(option => option.setName('boat').setDescription('Choose the ship for this trip').setAutocomplete(true))
    .addChannelOption(option => option.setName('from')
      .setDescription('Choose a departure channel, Forum, post, or thread')
      .addChannelTypes(...JOURNEY_CHANNEL_TYPES))
    .addChannelOption(option => option.setName('to')
      .setDescription('Choose a destination channel, Forum, post, or thread')
      .addChannelTypes(...JOURNEY_CHANNEL_TYPES))
    .addChannelOption(option => option.setName('category')
      .setDescription('Pick the server category that contains your sailing Forum')
      .addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(option => option.setName('forum')
      .setDescription('Pick the Forum where the Sailing Seas post will be created')
      .addChannelTypes(ChannelType.GuildForum))
    .addStringOption(option => option.setName('crew_name')
      .setDescription('Crew name used in the Sailing Seas post title')
      .setMaxLength(85))
    .addUserOption(option => option.setName('user').setDescription('Member whose manual departure to confirm')),

  async autocomplete(interaction, client) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value || '').toLowerCase();
    if (focused.name === 'boat') {
      const boats = await getBoats(client, interaction.guildId, interaction.user.id);
      return interaction.respond(boats.filter(boat => boat.name.toLowerCase().includes(query)).slice(0, 25)
        .map(boat => ({ name: formatShip(boat).replaceAll('*', '').slice(0, 100), value: boat.id })));
    }
    return interaction.respond([]);
  },

  async execute(interaction, config, client) {
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const journeys = await getJourneys(client, guildId);

    if (action === 'confirm') {
      if (!isStaff(interaction)) return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
      const user = interaction.options.getUser('user');
      if (!user || journeys[user.id]?.status !== 'pending') return interaction.reply({ content: 'There is no pending manual departure for that member.', ephemeral: true });
      journeys[user.id].status = 'traveling';
      journeys[user.id].startedAt = Date.now();
      await saveJourneys(client, guildId, journeys);
      const journey = journeys[user.id];
      const channel = await client.channels.fetch(journey.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({ content: '✅ Staff confirmed <@' + user.id + '>’s departure aboard **' + journey.boatName + '** from **' + journey.from + '** to **' + journey.to + '**.', allowedMentions: { users: [user.id], parse: [] } }).catch(() => {});
      }
      return interaction.reply({ content: '✅ Confirmed ' + user.toString() + '’s journey aboard **' + journey.boatName + '** from **' + journey.from + '** to **' + journey.to + '**.', allowedMentions: { users: [user.id], parse: [] } });
    }

    if (action === 'status') {
      await processJourneys(client, guildId, interaction.user.id);
      const journey = (await getJourneys(client, guildId))[interaction.user.id];
      if (!journey) return interaction.reply({ content: 'You do not have an active journey.', ephemeral: true });
      if (journey.status === 'pending') return interaction.reply({ content: 'Your departure from **' + journey.from + '** to **' + journey.to + '** aboard **' + journey.boatName + '** is waiting for staff confirmation.', ephemeral: true });
      const progress = getJourneyProgress(journey);
      const next = Math.min(100, progress + 25);
      const durationMs = Math.min(180000, Math.max(15000, Number(journey.durationMs) || Number(journey.durationMinutes || 3) * 60000));
      const remainingSeconds = Math.max(0, Math.ceil((durationMs * (1 - progress / 100)) / 1000));
      return interaction.reply({ content: '🚢 **' + journey.from + ' → ' + journey.to + '** aboard **' + journey.boatName + '**\nProgress: **' + progress + '%**. Next stage at **' + next + '%**. Estimated time remaining: ' + remainingSeconds + ' seconds.', ephemeral: true });
    }

    if (journeys[interaction.user.id]) return interaction.reply({ content: 'Finish your current journey before starting another. Journeys cannot be cancelled or skipped.', ephemeral: true });
    const fromChannel = interaction.options.getChannel('from');
    const toChannel = interaction.options.getChannel('to');
    const boatId = interaction.options.getString('boat');
    const category = interaction.options.getChannel('category');
    const forum = interaction.options.getChannel('forum');
    const crewName = interaction.options.getString('crew_name')?.trim();
    if (!fromChannel || !toChannel || !boatId) return interaction.reply({ content: 'Choose a ship, departure location, and destination location.', ephemeral: true });
    if (!category || !forum || !crewName) return interaction.reply({ content: 'For a new voyage, choose the Forum’s category and Forum, then enter your crew name.', ephemeral: true });
    if (category.type !== ChannelType.GuildCategory || forum.type !== ChannelType.GuildForum || forum.parentId !== category.id) {
      return interaction.reply({ content: 'Choose a Forum that is inside the category you selected.', ephemeral: true });
    }
    if (!isJourneyLocation(fromChannel) || !isJourneyLocation(toChannel)) return interaction.reply({ content: 'Choose server text channels, Forums, Forum posts, or threads for both journey locations.', ephemeral: true });
    if (fromChannel.id === toChannel.id) return interaction.reply({ content: 'Choose two different locations.', ephemeral: true });
    const canonicalFrom = locationName(fromChannel);
    const canonicalTo = locationName(toChannel);
    const cfg = await loadJourneyConfig(client, guildId);
    const boats = await getBoats(client, guildId, interaction.user.id);
    const boat = boats.find(item => item.id === boatId);
    if (!boat) return interaction.reply({ content: 'You do not own that ship. Use /shipyard action:catalog to get a ship first.', ephemeral: true });

    const durationMs = calculateTravelDuration(cfg.durationMinutes, boat);
    const journey = {
      from: canonicalFrom,
      to: canonicalTo,
      fromChannelId: fromChannel.id,
      toChannelId: toChannel.id,
      boatId: boat.id,
      boatName: boat.name,
      boatClass: boat.shipClass,
      boatQuality: boat.quality,
      crewName,
      categoryId: category.id,
      forumId: forum.id,
      status: cfg.manualChannelId ? 'pending' : 'traveling',
      progress: 0,
      startedAt: cfg.manualChannelId ? null : Date.now(),
      durationMs,
      durationMinutes: cfg.durationMinutes,
      channelId: null,
      createdAt: Date.now(),
    };

    const sailingPost = await forum.threads.create({
      name: ('Sailing Seas - ' + crewName).slice(0, 100),
      message: {
        content: '🏴‍☠️ **Sailing Seas**\n<@' + interaction.user.id + '>’s crew **' + crewName + '** is preparing to sail aboard **' + boat.name + '** from **' + canonicalFrom + '** to **' + canonicalTo + '**.\n' +
          (cfg.manualChannelId ? '⏳ Waiting for staff to confirm departure. Progress: **0%**.' : '⛵ Voyage underway. Progress: **0%**.'),
        allowedMentions: { users: [interaction.user.id], parse: [] },
      },
      reason: 'Create a Sailing Seas voyage log',
    }).catch(() => null);
    if (!sailingPost) {
      return interaction.reply({ content: 'I could not create the Sailing Seas post. Check that I can view and create posts in that Forum.', ephemeral: true });
    }
    journey.channelId = sailingPost.id;
    journey.sailingPostId = sailingPost.id;
    journeys[interaction.user.id] = journey;
    await saveJourneys(client, guildId, journeys);

    if (cfg.manualChannelId) {
      const channel = await client.channels.fetch(cfg.manualChannelId).catch(() => null);
      const request = '📜 Departure request: <@' + interaction.user.id + '> wants to sail aboard **' + boat.name + '** from **' + canonicalFrom + '** to **' + canonicalTo + '**. Sailing log: https://discord.com/channels/' + guildId + '/' + sailingPost.id + '. Staff can confirm with /boat action:confirm user:' + interaction.user.toString() + '.';
      const allowedMentions = { users: [interaction.user.id], parse: [] };
      if (channel?.type === ChannelType.GuildForum) {
        await channel.threads.create({
          name: ('Departure: ' + interaction.user.username + ' — ' + canonicalFrom + ' to ' + canonicalTo).slice(0, 100),
          message: { content: request, allowedMentions },
          reason: 'Create a manual island travel request',
        }).catch(() => {});
      } else if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({ content: request, allowedMentions }).catch(() => {});
      }
      return interaction.reply({ content: 'Your Sailing Seas post was created. Departure aboard **' + boat.name + '** is waiting for staff confirmation.', ephemeral: true });
    }

    return interaction.reply({ content: 'Your Sailing Seas post was created in **' + forum.name + '**. Journey started aboard **' + boat.name + '** and will arrive in about ' + Math.ceil(durationMs / 1000) + ' seconds (maximum 3 minutes).', ephemeral: true });
  }
};
