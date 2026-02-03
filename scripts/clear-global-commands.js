import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN/TOKEN or CLIENT_ID in environment variables.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Fetching existing global application commands...');
    const commands = await rest.get(Routes.applicationCommands(clientId));
    console.log(`Found ${commands.length} global commands.`);

    console.log('Clearing all global application commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    console.log('Successfully cleared all global application commands.');
    console.log('Note: It can take a few minutes for Discord to fully reflect these changes.');
  } catch (error) {
    console.error('Error clearing global application commands:', error);
    process.exit(1);
  }
})();

