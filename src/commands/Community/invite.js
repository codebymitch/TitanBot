import { SlashCommandBuilder } from 'discord.js';
import { memberInvitesEmbed } from '../../services/inviteRewardService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// `انفايت` / `انفايت @member`: a member's invites, the members they invited and their invite role progress.
export default {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription("Show your invites or another member's")
        .addUserOption((option) => option.setName('user').setDescription('Member to check').setRequired(false))
        .setDMPermission(false),
    category: 'Community',

    async execute(interaction, config, client) {
        const target = interaction.options.getUser('user') || interaction.user;
        if (target.bot) {
            await InteractionHelper.safeReply(interaction, { content: 'البوتات مالهاش دعوات 🤖' });
            return;
        }
        const embed = await memberInvitesEmbed(client, interaction.guild, target);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};
