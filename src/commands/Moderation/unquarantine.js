import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';

const DB_PATH = './quarantine_data.json';

export default {
    data: new SlashCommandBuilder()
        .setName('unquarantine')
        .setDescription('Remove quarantine role and restore previous roles')
        .addUserOption(option => option.setName('user').setDescription('Member to unquarantine').setRequired(true)),
    
    async execute(interaction) {
        const target = interaction.options.getMember('user');

        // Safety check: Ensure target exists
        if (!target) {
            return interaction.reply({ content: 'Error: Could not find that member.', ephemeral: true });
        }

        if (!fs.existsSync(DB_PATH)) {
            return interaction.reply({ content: 'No quarantine data file found.', ephemeral: true });
        }

        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

        if (!data[target.id]) {
            return interaction.reply({ content: 'This user is not currently in quarantine or has no saved roles.', ephemeral: true });
        }

        const oldRoles = data[target.id];
        
        try {
            await target.roles.set(oldRoles);

            // Remove data after restoring roles
            delete data[target.id];
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

            await interaction.reply({ content: `Successfully unquarantined ${target.user.tag}.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to restore roles. Check bot permissions.', ephemeral: true });
        }
    }
};
