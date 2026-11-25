import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff, loadJourneyConfig } from '../../services/berryRpg.js';
import { getJourneyProgress, getJourneys, processJourneys, saveJourneys } from '../../services/berryTravel.js';
import { calculateTravelDuration, formatShip, getBoats } from '../../services/berryShips.js';

export default {
  data: new SlashCommandBuilder()
    .setName('boat')
    .setDescription('Start or check an island journey.')
    .addStringOption(option => option.setName('action').setDescription('Journey action').setRequired(true)
      .addChoices({ name: 'Start journey', value: 'start' }, { name: 'Check progress', value: 'status' }, { name: 'Confirm manual departure (staff)', value: 'confirm' }))
    .addStringOption(option => option.setName('boat').setDescription('Choose the ship for this trip').setAutocomplete(true))
    .addStringOption(option => option.setName('from').setDescription('Departure island').setAutocomplete(true))
    .addStringOption(option => option.setName('to').setDescription('Destination island').setAutocomplete(true))
    .addUserOption(option => option.setName('user').setDescription('Member whose manual departure to confirm')),

  async autocomplete(interaction, client) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value || '').toLowerCase();
    if (focused.name === 'boat') {
      const boats = await getBoats(client, interaction.guildId, interaction.user.id);
      return interaction.respond(boats.filter(boat => boat.name.toLowerCase().includes(query)).slice(0, 25)
        .map(boat => ({ name: formatShip(boat).replaceAll('*', '').slice(0, 100), value: boat.id })));
    }
    const cfg = await loadJourneyConfig(client, interaction.guildId);
    return interaction.respond(cfg.islands.filter(name => name.toLowerCase().includes(query)).slice(0, 25).map(name => ({ name, value: name })));
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
    const from = interaction.options.getString('from');
    const to = interaction.options.getString('to');
    const boatId = interaction.options.getString('boat');
    if (!from || !to || !boatId) return interaction.reply({ content: 'Choose a ship, departure island, and destination.', ephemeral: true });
    if (from.toLowerCase() === to.toLowerCase()) return interaction.reply({ content: 'Choose two different islands.', ephemeral: true });
    const cfg = await loadJourneyConfig(client, guildId);
    const canonicalFrom = cfg.islands.find(name => name.toLowerCase() === from.toLowerCase());
    const canonicalTo = cfg.islands.find(name => name.toLowerCase() === to.toLowerCase());
    if (!canonicalFrom || !canonicalTo) return interaction.reply({ content: 'Both islands must be in the travel list. Staff can manage them with /boatconfig.', ephemeral: true });
    const boats = await getBoats(client, guildId, interaction.user.id);
    const boat = boats.find(item => item.id === boatId);
    if (!boat) return interaction.reply({ content: 'You do not own that ship. Use /shipyard action:catalog to get a ship first.', ephemeral: true });

    const durationMs = calculateTravelDuration(cfg.durationMinutes, boat);
    const journey = {
      from: canonicalFrom,
      to: canonicalTo,
      boatId: boat.id,
      boatName: boat.name,
      boatClass: boat.shipClass,
      boatQuality: boat.quality,
      status: cfg.manualChannelId ? 'pending' : 'traveling',
      progress: 0,
      startedAt: cfg.manualChannelId ? null : Date.now(),
      durationMs,
      durationMinutes: cfg.durationMinutes,
      channelId: interaction.channelId,
      createdAt: Date.now(),
    };
    journeys[interaction.user.id] = journey;
    await saveJourneys(client, guildId, journeys);

    if (cfg.manualChannelId) {
      const channel = await client.channels.fetch(cfg.manualChannelId).catch(() => null);
      const request = '📜 Departure request: <@' + interaction.user.id + '> wants to sail aboard **' + boat.name + '** from **' + canonicalFrom + '** to **' + canonicalTo + '**. Staff can confirm with /boat action:confirm user:' + interaction.user.toString() + '.';
      const allowedMentions = { users: [interaction.user.id], parse: [] };
      if (channel?.type === ChannelType.GuildForum) {
        const thread = await channel.threads.create({
          name: ('Departure: ' + interaction.user.username + ' — ' + canonicalFrom + ' to ' + canonicalTo).slice(0, 100),
          message: { content: request, allowedMentions },
          reason: 'Create a manual island travel request',
        }).catch(() => null);
        if (thread) {
          journey.channelId = thread.id;
          await saveJourneys(client, guildId, journeys);
        }
      } else if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({ content: request, allowedMentions }).catch(() => {});
        journey.channelId = channel.id;
        await saveJourneys(client, guildId, journeys);
      }
      return interaction.reply({ content: 'Your departure request aboard **' + boat.name + '** was posted for staff. You cannot start another trip until this one arrives.', ephemeral: true });
    }

    await interaction.channel.send({ content: '🚢 <@' + interaction.user.id + '> departed **' + canonicalFrom + '** for **' + canonicalTo + '** aboard **' + boat.name + '**.', allowedMentions: { users: [interaction.user.id], parse: [] } }).catch(() => {});
    return interaction.reply({ content: 'Journey started aboard **' + boat.name + '**. This ship will arrive in about ' + Math.ceil(durationMs / 1000) + ' seconds (maximum 3 minutes).', ephemeral: true });
  }
};
