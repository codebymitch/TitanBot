import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROASTS = [
    "I'd roast you, but my mom said I'm not allowed to burn trash.",
    "You're the reason the gene pool needs a lifeguard.",
    "I'd agree with you, but then we'd both be wrong.",
    "You're not stupid; you just have bad luck thinking.",
    "I've seen better looking faces on a clock.",
    "If brains were dynamite, you wouldn't have enough to blow your hat off.",
    "You're proof that even God makes mistakes sometimes.",
    "I'd give you a nasty look, but you already have one.",
    "Some day you'll go far — and I hope you stay there.",
    "You're the human equivalent of a participation trophy.",
    "I'd call you a tool, but even tools are useful.",
    "You bring everyone so much joy... when you leave the room.",
    "I've met some real characters, and you're definitely something.",
    "If you were any less impressive, you'd be a footnote.",
    "Your secrets are always safe with me — I never listen when you talk.",
    "You have something on your chin. No, the third one down.",
    "I'd explain it to you, but I don't have the time or the crayons.",
    "You're like a cloud — when you disappear, it's a beautiful day.",
    "Light travels faster than sound, which is why you seemed bright until you spoke.",
    "I thought of you today. It reminded me to take out the trash.",
];

export default {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('Roast a user')
        .addUserOption(opt =>
            opt.setName('user').setDescription('The user to roast').setRequired(true)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const roast  = ROASTS[Math.floor(Math.random() * ROASTS.length)];

        const embed = createEmbed({
            title: `🔥 Roasting ${target.username}`,
            description: roast,
            color: 'error',
            footer: { text: `Requested by ${interaction.user.username}` },
        });

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};
