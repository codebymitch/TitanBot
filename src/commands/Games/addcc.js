import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { adjustCC } from '../../services/cc/ccService.js';
import { CC, formatCC, ccEmbed } from '../../config/cc.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Stands in for "me" when `addcc 500` is typed without a target (prefix parsing fills options in order).
const SELF = '0'.repeat(20);

// `addcc 500` adds CC to the owner; replying to someone (or `addcc @member 500`) adds it to them instead.
// Owner only (SERVER_OWNER_IDS). Not a transfer: nothing is taken from anyone and no tax applies.
export default {
    data: new SlashCommandBuilder()
        .setName('addcc')
        .setDescription(`Owner only: add ${CC.name} (${CC.short}) to yourself or another member`)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addUserOption((option) => option.setName('user').setDescription('Who gets the CC (default: you)').setRequired(false))
        .addIntegerOption((option) => option
            .setName('amount')
            .setDescription(`How much ${CC.short} to add`)
            .setMinValue(1)
            .setMaxValue(1_000_000_000)
            .setRequired(true)),

    normalizePrefixArgs(args) {
        return args.length === 1 && /^\d+$/u.test(args[0]) ? [SELF, ...args] : args;
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        if (!isServerOwner(interaction.user.id)) return reply({ content: '❌ الأمر ده للأونر بس.' });

        const picked = interaction.options.getUser('user');
        const target = !picked || picked.id === SELF ? interaction.user : picked;
        const amount = interaction.options.getInteger('amount');
        if (target.bot) return reply({ content: 'البوتات مالهاش CC 🤖' });
        if (!Number.isSafeInteger(amount) || amount <= 0) return reply({ content: '❌ الكمية لازم تكون رقم صحيح أكبر من صفر.' });

        const { balance } = await adjustCC(client, interaction.guildId, target.id, amount, interaction.user.id);
        const embed = ccEmbed(`${CC.emoji} تمت إضافة ${CC.short}`, `${target}\n\n➕ ${formatCC(amount)}\n💰 الرصيد الجديد: ${formatCC(balance)}`);
        await reply({ embeds: [embed] });
    },
};
