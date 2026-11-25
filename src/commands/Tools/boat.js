import { SlashCommandBuilder } from 'discord.js';
import { isStaff, loadJourneyConfig } from '../../services/berryRpg.js';
import { getJourneyProgress, getJourneys, processJourneys, saveJourneys } from '../../services/berryTravel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('boat')
    .setDescription('Start or check an island journey.')
    .addStringOption(option => option.setName('action').setDescription('Journey action').setRequired(true)
      .addChoices({ name: 'Start journey', value: 'start' }, { name: 'Check progress', value: 'status' }, { name: 'Repair a stranded ship', value: 'repair' }, { name: 'Confirm manual departure (staff)', value: 'confirm' }))
    .addStringOption(option => option.setName('from').setDescription('Departure island').setAutocomplete(true))
    .addStringOption(option => option.setName('to').setDescription('Destination island').setAutocomplete(true))
    .addUserOption(option => option.setName('user').setDescription('Member whose manual departure to confirm')),

  async autocomplete(interaction, client) {
    const cfg = await loadJourneyConfig(client, interaction.guildId);
    const query = String(interaction.options.getFocused() || '').toLowerCase();
    return interaction.respond(cfg.islands.filter(name => name.toLowerCase().includes(query)).slice(0, 25).map(name => ({ name, value: name })));
  },

  async execute(interaction, config, client) {
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const journeys = await getJourneys(client, guildId);

    if (action === 'confirm') {
      if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can confirm departures.', ephemeral: true });
      const user = interaction.options.getUser('user');
      if (!user || journeys[user.id]?.status !== 'pending') return interaction.reply({ content: 'There is no pending manual departure for that member.', ephemeral: true });
      journeys[user.id].status = 'traveling';
      journeys[user.id].startedAt = Date.now();
      journeys[user.id].channelId = interaction.channelId;
      await saveJourneys(client, guildId, journeys);
      return interaction.reply({ content: '✅ Confirmed ' + user.toString() + '’s journey from **' + journeys[user.id].from + '** to **' + journeys[user.id].to + '**. They can use /boat action:status to check progress.', allowedMentions: { users: [user.id], parse: [] } });
    }

    if (action === 'repair') {
      const journey = journeys[interaction.user.id];
      if (!journey || journey.status !== 'stalled') return interaction.reply({ content: 'Your ship is not waiting for repairs.', ephemeral: true });
      journey.startedAt += Date.now() - journey.stalledAt;
      journey.status = 'traveling';
      delete journey.stalledAt;
      await saveJourneys(client, guildId, journeys);
      return interaction.reply({ content: '🔧 Repairs are complete. Your journey from **' + journey.from + '** to **' + journey.to + '** continues at ' + journey.progress + '%.', ephemeral: true });
    }

    if (action === 'status') {
      await processJourneys(client, guildId, interaction.user.id);
      const latest = await getJourneys(client, guildId);
      const journey = latest[interaction.user.id];
      if (!journey) return interaction.reply({ content: 'You do not have an active journey.', ephemeral: true });
      if (journey.status === 'pending') return interaction.reply({ content: 'Your departure from **' + journey.from + '** to **' + journey.to + '** is waiting for staff confirmation.', ephemeral: true });
      if (journey.status === 'stalled') return interaction.reply({ content: 'Your ship is stranded at ' + journey.progress + '%. Use /boat action:repair to continue.', ephemeral: true });
      const progress = getJourneyProgress(journey);
      const next = Math.min(100, progress + 25);
      return interaction.reply({ content: '🚢 **' + journey.from + ' → ' + journey.to + '**\nProgress: **' + progress + '%**. Next stage at **' + next + '%**. Journey length: ' + journey.durationMinutes + ' minutes. The bot posts each stage and arrival automatically.', ephemeral: true });
    }

    if (journeys[interaction.user.id]) return interaction.reply({ content: 'Finish your current journey before starting another. Journeys cannot be cancelled or skipped.', ephemeral: true });
    const from = interaction.options.getString('from');
    const to = interaction.options.getString('to');
    if (!from || !to) return interaction.reply({ content: 'Choose both a departure island and destination.', ephemeral: true });
    if (from.toLowerCase() === to.toLowerCase()) return interaction.reply({ content: 'Choose two different islands.', ephemeral: true });
    const cfg = await loadJourneyConfig(client, guildId);
    const canonicalFrom = cfg.islands.find(name => name.toLowerCase() === from.toLowerCase());
    const canonicalTo = cfg.islands.find(name => name.toLowerCase() === to.toLowerCase());
    if (!canonicalFrom || !canonicalTo) return interaction.reply({ content: 'Both islands must be in the travel list. Staff can manage it with /boatconfig.', ephemeral: true });

    const journey = {
      from: canonicalFrom,
      to: canonicalTo,
      status: cfg.manualChannelId ? 'pending' : 'traveling',
      progress: 0,
      startedAt: cfg.manualChannelId ? null : Date.now(),
      durationMinutes: cfg.durationMinutes,
      channelId: interaction.channelId,
      createdAt: Date.now(),
    };
    journeys[interaction.user.id] = journey;
    await saveJourneys(client, guildId, journeys);

    if (cfg.manualChannelId) {
      const channel = await client.channels.fetch(cfg.manualChannelId).catch(() => null);
      if (channel?.isTextBased()) await channel.send('📜 Departure request: <@' + interaction.user.id + '> wants to travel from **' + canonicalFrom + '** to **' + canonicalTo + '**. Staff can confirm with /boat action:confirm user:' + interaction.user.toString() + '.');
      return interaction.reply({ content: 'Your departure request was posted for staff. You cannot start another trip until this journey is completed.', ephemeral: true });
    }

    return interaction.reply({ content: '🚢 Journey started: **' + canonicalFrom + '** → **' + canonicalTo + '**. Progress takes ' + cfg.durationMinutes + ' minutes, with updates at 25%, 50%, 75%, and 100%. You cannot cancel or skip it.', ephemeral: true });
  }
};
