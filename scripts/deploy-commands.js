#!/usr/bin/env node

/**
 * Deploy Slash Commands Script
 * 
 * Registers all slash commands to a specific guild without restarting the bot.
 * 
 * Usage:
 *   node scripts/deploy-commands.js <GUILD_ID>
 *   node scripts/deploy-commands.js  (uses GUILD_ID from .env)
 */

import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import { loadCommands } from '../src/handlers/commandLoader.js';
import config from '../src/config/application.js';

const GUILD_ID = process.argv[2] || process.env.GUILD_ID;

if (!GUILD_ID) {
  console.error('❌ Error: GUILD_ID not provided and not set in .env');
  console.error('Usage: node scripts/deploy-commands.js <GUILD_ID>');
  process.exit(1);
}

if (!config.bot.token) {
  console.error('❌ Error: Bot token not found in .env');
  process.exit(1);
}

console.log('🚀 Deploying slash commands...');
console.log(`📍 Guild ID: ${GUILD_ID}`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

try {
  // Load all commands
  console.log('📦 Loading commands...');
  await loadCommands(client);
  console.log(`✅ Loaded ${client.commands.size} commands`);

  // Login to Discord
  console.log('🔑 Logging into Discord...');
  await client.login(config.bot.token);

  // Wait for ready
  await new Promise(resolve => {
    client.once('ready', () => {
      console.log(`✅ Connected as ${client.user.tag}`);
      resolve();
    });
  });

  // Get the guild
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.error(`❌ Error: Guild ${GUILD_ID} not found or bot doesn't have access`);
    process.exit(1);
  }

  console.log(`✅ Found guild: ${guild.name}`);

  // Prepare commands
  const commands = [];
  const commandsToRegister = [];

  for (const [, command] of client.commands) {
    if (command.data) {
      commands.push(command.data.toJSON());
      commandsToRegister.push(command.data.name);
    }
  }

  console.log(`\n📋 Commands to register:`);
  commandsToRegister.forEach(cmd => console.log(`  • /${cmd}`));

  // Register commands
  console.log('\n🔄 Registering commands...');
  await guild.commands.set(commands);
  console.log(`✅ Successfully registered ${commands.length} commands!`);

  // Verify
  const registered = await guild.commands.fetch();
  console.log(`\n✅ Verification: ${registered.size} commands are now available in ${guild.name}`);

  console.log('\n🎉 Deploy complete!');
  process.exit(0);
} catch (error) {
  console.error('❌ Deploy failed:', error.message);
  process.exit(1);
}
