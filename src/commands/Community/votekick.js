import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import {
    VOTE_KICK, VOTE_KICK_FAILURE_TEXT, startVoteKick, voteKickPayload, expireVote,
} from '../../services/voice/voteKickService.js';

// `فوت كيك @member [reason]` / `/votekick` from a voice channel's text chat (reports #183, #185): the
// members in the channel vote with a button (src/interactions/buttons/voice/voteKick.js); when enough
// vote the member is disconnected and can't join that channel again (services/voice/voteKickService.js).
// Our server only.
export default {
    data: new SlashCommandBuilder()
        .setName('votekick')
        .setDescription('Vote to kick a member from your voice channel (use it in the voice channel chat)')
        .setDMPermission(false)
        .addUserOption((option) => option.setName('user').setDescription('Who to vote kick').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Why').setMaxLength(200)),

    async execute(interaction) {
        const reply = (content) => InteractionHelper.safeReply(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        if (!isHomeGuild(interaction.guildId)) return reply(VOTE_KICK_FAILURE_TEXT.not_home);

        const { guild, channel } = interaction;
        const starter = guild.members.cache.get(interaction.user.id) || await guild.members.fetch(interaction.user.id).catch(() => null);
        const targetUser = interaction.options.getUser('user');
        const target = targetUser && (guild.members.cache.get(targetUser.id) || await guild.members.fetch(targetUser.id).catch(() => null));
        const result = startVoteKick({ guild, channel, starter, target, reason: interaction.options.getString('reason') });
        if (!result.ok) return reply(VOTE_KICK_FAILURE_TEXT[result.reason]);

        const { vote } = result;
        const message = await channel.send(voteKickPayload(vote)).catch(() => null);
        if (!message) {
            expireVote(vote.id);
            return reply('❌ مقدرتش أبعت التصويت هنا.');
        }
        if (!interaction._sourceMessage) await reply('✅ التصويت بدأ.');
        setTimeout(async () => {
            const expired = expireVote(vote.id);
            if (expired) await message.edit(voteKickPayload(expired, { ended: '⏱️ خلص الوقت ومكملش العدد، محدش اتطرد.' })).catch(() => {});
        }, VOTE_KICK.durationMs).unref?.();
    },
};
