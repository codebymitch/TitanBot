import { REST, Routes } from 'discord.js';
import config from './src/config/index.js';

// Test AFK command registration
const afkCommand = {
    name: 'afk',
    description: 'Set yourself as AFK (Away From Keyboard)',
    options: [
        {
            name: 'reason',
            description: 'The reason for being AFK',
            type: 3, // STRING
            required: false
        },
        {
            name: 'remove',
            description: 'Remove your AFK status',
            type: 5, // BOOLEAN
            required: false
        }
    ]
};

const rest = new REST({ version: '10' }).setToken(config.bot.token);

async function testAFKCommand() {
    try {
        console.log('Testing AFK command registration...');
        
        // Get existing commands
        const existingCommands = await rest.get(
            Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId)
        );
        
        console.log(`Found ${existingCommands.length} existing commands`);
        
        // Check if AFK command exists
        const afkExists = existingCommands.some(cmd => cmd.name === 'afk');
        console.log(`AFK command exists: ${afkExists}`);
        
        if (afkExists) {
            console.log('AFK command details:', existingCommands.find(cmd => cmd.name === 'afk'));
        } else {
            console.log('AFK command not found in registered commands');
            
            // Register just the AFK command for testing
            console.log('Registering AFK command...');
            await rest.post(
                Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId),
                { body: [afkCommand] }
            );
            console.log('AFK command registered successfully!');
        }
        
    } catch (error) {
        console.error('Error testing AFK command:', error);
    }
}

testAFKCommand();
