import { SlashCommandBuilder } from 'discord.js';
import { inviteTopEmbed } from '../../services/inviteRewardService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// `top invites` / `توب دعوات` / `دعواتي`: who invited the most members, your own invites and the reward rules.
export default {
    data: new SlashCommandBuilder()
        .setName('invitetop')
        .setDescription('Invites leaderboard and the invite rewards')
        .setDMPermission(false),
    category: 'Community',

    async execute(interaction, config, client) {
        const embed = await inviteTopEmbed(client, interaction.guild, interaction.user.id);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};
