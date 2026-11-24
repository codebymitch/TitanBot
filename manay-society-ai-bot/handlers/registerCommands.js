import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';

export async function registerCommands(client, { token, clientId, guildId }) {
  const directoryPath = fileURLToPath(new URL('../commands/', import.meta.url));
  const files = (await readdir(directoryPath)).filter((file) => file.endsWith('.js'));
  const commands = [];

  for (const file of files) {
    const moduleUrl = pathToFileURL(join(directoryPath, file));
    const command = (await import(moduleUrl.href)).default;
    if (!command?.data || typeof command.execute !== 'function') {
      throw new Error(`Command ${file} must export data and execute().`);
    }
    commands.push(command.data.toJSON());
    client.commands.set(command.data.name, command);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands${guildId ? ` for guild ${guildId}` : ' globally'}.`);
}
