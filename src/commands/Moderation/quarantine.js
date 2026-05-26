import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import fs from 'fs';

const DB_PATH = './quarantine_data.json';

const loadData = () => {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
};

export default {
    data: new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Quarantine a member')
        .addUserOption(option => option.setName('user').setDescription('Member to quarantine').setRequired(true)),
    
    async execute(interaction) {
        // Permission check
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const member = interaction.options.getMember('user');
        
        // Safety check: Ensure member exists
        if (!member) {
            return interaction.reply({ content: 'Error: Could not find that member.', ephemeral: true });
        }

        const quarantineRole = interaction.guild.roles.cache.find(r => r.name === 'Quarantine');
        
        // Safety check: Ensure the role exists
        if (!quarantineRole) {
            return interaction.reply({ content: 'Error: Role "Quarantine" not found in this server.', ephemeral: true });
        }
        
        // Save previous roles
        const data = loadData();
        data[member.id] = member.roles.cache.filter(r => r.id !== interaction.guild.id && r.id !== quarantineRole.id).map(r => r.id);
        
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

        try {
            await member.roles.set([quarantineRole.id]);
            await interaction.reply({ content: `Successfully quarantined ${member.user.tag}.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to apply roles. Check bot permissions or role hierarchy.', ephemeral: true });
        }
    }
};
