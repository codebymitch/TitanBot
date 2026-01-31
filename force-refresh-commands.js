import { REST, Routes } from 'discord.js';
import config from './src/config/index.js';

const rest = new REST({ version: '10' }).setToken(config.bot.token);

async function forceRefreshCommands() {
    try {
        console.log('Force refreshing guild commands...');
        
        // First, clear ALL existing guild commands
        const guild = await rest.get(Routes.guild(config.bot.guildId));
        console.log(`Clearing commands for guild: ${guild.name}`);
        
        await rest.put(
            Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId),
            { body: [] }
        );
        
        console.log('Cleared all existing commands. Waiting 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Now get the commands from the running bot and re-register them
        // We'll need to import the command loader to get the actual commands
        const { loadCommands, registerCommands } = await import('./src/handlers/commandLoader.js');
        
        // Create a minimal client to load commands
        const client = {
            commands: new Map(),
            guilds: {
                cache: new Map()
            }
        };
        
        await loadCommands(client);
        
        // Convert commands to JSON format
        const commands = [];
        for (const command of client.commands.values()) {
            if (command.data && typeof command.data.toJSON === 'function') {
                commands.push(command.data.toJSON());
            }
        }
        
        console.log(`Registering ${commands.length} commands...`);
        
        // Register the commands
        await rest.put(
            Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId),
            { body: commands }
        );
        
        console.log('✅ Commands successfully refreshed!');
        console.log('Check Discord in 1-2 minutes for the commands to appear.');
        
        // List AFK commands specifically
        const afkCommands = commands.filter(cmd => cmd.name.includes('afk'));
        console.log(`\nAFK commands registered: ${afkCommands.length}`);
        afkCommands.forEach(cmd => {
            console.log(`- /${cmd.name}: ${cmd.description}`);
        });
        
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }
}

forceRefreshCommands();
