import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Required env vars: BOT_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function getAllFiles(dir, fileList = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'modules') continue;
      await getAllFiles(full, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      fileList.push(full);
    }
  }
  return fileList;
}

async function loadCommands() {
  const commands = [];
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const files = await getAllFiles(commandsPath);

  for (const file of files) {
    try {
      const fileUrl = pathToFileURL(file).href;
      const mod = await import(`${fileUrl}`);
      const cmd = mod.default || mod;
      if (cmd && cmd.data && typeof cmd.data.toJSON === 'function') {
        commands.push(cmd.data.toJSON());
      }
    } catch (err) {
      console.error(`Failed to load command file ${file}:`, err);
    }
  }

  return commands;
}

(async () => {
  try {
    const commands = await loadCommands();
    console.log(`Registering ${commands.length} commands to guild ${GUILD_ID}`);
    const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Registration result:', Array.isArray(res) ? `${res.length} commands registered` : res);
  } catch (err) {
    console.error('Error registering guild commands:', err);
    process.exit(1);
  }
})();
