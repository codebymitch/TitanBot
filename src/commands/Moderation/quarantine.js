import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { pool } from '../../config/db.js'; // Ensure this path matches your project

export default {
    data: new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Quarantine a member and save their roles')
        .addUserOption(option => option.setName('user').setDescription('The user to quarantine').setRequired(true)),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({ content: 'Missing permissions!', ephemeral: true });
        }

        const member = interaction.options.getMember('user');
        const quarantineRole = interaction.guild.roles.cache.find(r => r.name === 'Quarantine');
        
        if (!quarantineRole) {
            return interaction.reply({ content: 'Quarantine role not found!', ephemeral: true });
        }

        // Filter out @everyone and the quarantine role itself
        const currentRoles = member.roles.cache
            .filter(r => r.id !== interaction.guild.id && r.id !== quarantineRole.id)
            .map(r => r.id);

        try {
            // Save roles to PostgreSQL
            await pool.query(
                'INSERT INTO user_roles (user_id, roles) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET roles = $2',
                [member.id, currentRoles]
            );

            await member.roles.set([quarantineRole.id]);
            await interaction.reply({ content: `Successfully quarantined ${member.user.tag}. Roles saved.`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'An error occurred while saving roles.', ephemeral: true });
        }
    }
};
