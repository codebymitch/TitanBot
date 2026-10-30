import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildGuideEmbeds } from '../../services/cc/guideUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// `شرح` / `/guide`: sends the simple CC, store and bourse guide (services/cc/guideUi.js) to the member
// in DM. The chat only gets a short note, gone after a few seconds.
const NOTE_DELETE_MS = 5_000;
const SENT = '📬 بعتلك الشرح في الخاص.';
const DM_CLOSED = '❌ مقدرتش أبعتلك في الخاص، افتح الرسايل الخاصة من السيرفر وجرّب تاني.';

export default {
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('Get a simple guide to CC, the store and the bourse in DM')
        .setDMPermission(false),

    async execute(interaction) {
        const sent = await interaction.user.send({ embeds: buildGuideEmbeds({ guildId: interaction.guildId }) }).then(() => true).catch(() => false);
        const content = sent ? SENT : DM_CLOSED;
        const source = interaction._sourceMessage;
        if (!source) {
            return InteractionHelper.safeReply(interaction, { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }
        const note = await source.channel.send({ content: `${interaction.user} ${content}`, allowedMentions: { parse: [] } }).catch(() => null);
        setTimeout(() => {
            note?.delete().catch(() => {});
            source.delete().catch(() => {});
        }, NOTE_DELETE_MS).unref?.();
    },
};
