import { SlashCommandBuilder } from 'discord.js';
import { db } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unquarantine')
        .setDescription('Remove quarantine and restore roles')
        .addUserOption(option => option.setName('user').setDescription('Member to unquarantine').setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getMember('user');
        if (!target) return interaction.editReply({ content: 'Member not found.' });

        try {
            const res = await db.query('SELECT roles FROM quarantine_data WHERE user_id = $1', [target.id]);
            
            if (res.rows.length === 0) {
                return interaction.editReply({ content: 'This user is not in quarantine database.' });
            }

            const oldRoles = JSON.parse(res.rows[0].roles);
            
            await target.roles.set(oldRoles);
            await db.query('DELETE FROM quarantine_data WHERE user_id = $1', [target.id]);

            await interaction.editReply({ content: `Successfully unquarantined ${target.user.tag}.` });
        } catch (error) {
            console.error('Database Error:', error);
            await interaction.editReply({ content: 'Database error or missing permissions.' });
        }
    }
};
