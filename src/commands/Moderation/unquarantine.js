import { SlashCommandBuilder } from 'discord.js';
import db from '../../Utility/src/config/db.js'; // Điều chỉnh đường dẫn này đến file db.js của bạn

export default {
    data: new SlashCommandBuilder()
        .setName('unquarantine')
        .setDescription('Remove quarantine and restore roles')
        .addUserOption(option => option.setName('user').setDescription('Member to unquarantine').setRequired(true)),
    
    async execute(interaction) {
        // Fix for Interaction expired
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getMember('user');
        if (!target) return interaction.editReply({ content: 'Member not found.' });

        try {
            // Retrieve from DB
            const res = await db.query('SELECT roles FROM quarantine_data WHERE user_id = $1', [target.id]);
            
            if (res.rows.length === 0) {
                return interaction.editReply({ content: 'This user is not in quarantine database.' });
            }

            const oldRoles = JSON.parse(res.rows[0].roles);
            
            // Restore roles
            await target.roles.set(oldRoles);
            
            // Delete from DB
            await db.query('DELETE FROM quarantine_data WHERE user_id = $1', [target.id]);

            await interaction.editReply({ content: `Successfully unquarantined ${target.user.tag}.` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Database error or missing permissions.' });
        }
    }
};
