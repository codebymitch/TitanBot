import { Events } from 'discord.js';
import { startupLog } from '../utils/logger.js';
import { resumeCommunityPolls } from '../services/communityPollService.js';
import { validateSavedRolePanels } from '../services/roleSystemService.js';
import { validateSavedTickets } from '../services/ticketSystemService.js';
export default { name: Events.ClientReady, once: true, async execute(client) {
  client.user.setPresence(client.config.bot.presence);
  await resumeCommunityPolls(client);
  await validateSavedRolePanels(client);
  await validateSavedTickets(client);
  startupLog(`Ready as ${client.user.tag}; serving ${client.guilds.cache.size} server(s).`);
} };
