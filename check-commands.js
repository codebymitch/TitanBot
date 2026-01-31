// Simple script to check what commands are registered
import { REST, Routes } from 'discord.js';

// You'll need to set these environment variables or replace them
const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';  
const GUILD_ID = process.env.GUILD_ID || 'YOUR_GUILD_ID';

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function checkCommands() {
    try {
        console.log('Checking registered commands...');
        
        const commands = await rest.get(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        );
        
        console.log(`Found ${commands.length} registered commands:`);
        commands.forEach(cmd => {
            console.log(`- /${cmd.name}: ${cmd.description}`);
            if (cmd.options && cmd.options.length > 0) {
                cmd.options.forEach(opt => {
                    console.log(`  └── ${opt.name}: ${opt.description} (${opt.required ? 'required' : 'optional'})`);
                });
            }
        });
        
        // Check specifically for AFK
        const afkCommand = commands.find(cmd => cmd.name === 'afk');
        if (afkCommand) {
            console.log('\n✅ AFK command found!');
            console.log('Details:', JSON.stringify(afkCommand, null, 2));
        } else {
            console.log('\n❌ AFK command NOT found in registered commands');
        }
        
    } catch (error) {
        console.error('Error checking commands:', error);
    }
}

checkCommands();
