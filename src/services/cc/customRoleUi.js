// customRoleUi.js — the form, embeds and buttons of the custom roles (customRoleService.js): the
// "pick a name, colour and icon" form of the store, the invite with its accept / decline buttons,
// and `رولي` with a button for each thing the member can do (src/interactions/buttons/store/myRole.js).
// Plain embed objects so the emojis stay.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, FileUploadBuilder, LabelBuilder, ModalBuilder, StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } from 'discord.js';
import { ccEmbed, formatCC } from '../../config/cc.js';
import { customRoleSettings } from '../../config/store/ccStoreItems.js';
import { canUseRoleIcons } from './customRoleService.js';

export const CUSTOM_ROLE_PREFIX = 'customrole';
// The buttons of `رولي`: `myrole:<action>:<ownerId>[:<roleId>]`, only for the member who asked.
export const MY_ROLE_PREFIX = 'myrole';
// The pickers those buttons open (answered in place by a collector, so no `:` and no global handler).
export const MY_ROLE_PICK = { invite: 'myrolepick_invite', kick: 'myrolepick_kick', leader: 'myrolepick_leader' };
const timestamp = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** The store's form for a custom role: name, colour and (on servers with role icons) an icon. */
export function customRoleModal(item, guild) {
    const modal = new ModalBuilder()
        .setCustomId(`${CUSTOM_ROLE_PREFIX}:create:${item.id}`)
        .setTitle(`${item.emoji || '🎨'} ${item.name}`.slice(0, 45));
    const hint = new TextDisplayBuilder().setContent(
        `💵 ${formatCC(item.price)} كل ${customRoleSettings.days} يوم، بتتاخد من رصيدك وبتتجدد لوحدها.`
        + (item.kind === 'friends' ? `\n👥 بعد ما تشتريها ابعت لصحابك \`رولي انفايت @صاحبك\` (لحد ${item.maxMembers - 1}).` : ''),
    );
    const name = new LabelBuilder()
        .setLabel('اسم الرول')
        .setTextInputComponent(new TextInputBuilder()
            .setCustomId('name')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(customRoleSettings.maxNameLength)
            .setPlaceholder('مثلاً: 🔥 الأساطير')
            .setRequired(true));
    const color = new LabelBuilder()
        .setLabel('اللون (اختياري)')
        .setDescription('زي #ff0000 أو احمر، ازرق، ذهبي...')
        .setTextInputComponent(new TextInputBuilder()
            .setCustomId('color')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(12)
            .setPlaceholder('#f1c40f')
            .setRequired(false));
    modal.addTextDisplayComponents(hint).addLabelComponents(name, color);
    if (canUseRoleIcons(guild)) {
        modal.addLabelComponents(new LabelBuilder()
            .setLabel('أيقونة الرول (اختياري)')
            .setDescription('صورة PNG أو JPG، أقل من 256KB')
            .setFileUploadComponent(new FileUploadBuilder().setCustomId('icon').setMaxValues(1).setRequired(false)));
    }
    return modal;
}

const hex = (color) => `#${color.toString(16).padStart(6, '0')}`;

/** Trial mode: what the role would look like; nothing is taken or created. */
export function customRolePreviewEmbed(user, item, { name, color, iconUrl }) {
    const embed = ccEmbed('🧪 شكل الرول (تجريبي)', [
        `${user} جرب يشتري **${item.emoji || ''} ${item.name}**`,
        '',
        `🏷️ الاسم: **${name}**`,
        `🎨 اللون: \`${hex(color)}\``,
        `💵 السعر: ${formatCC(item.price)} في الشهر`,
        '',
        '🧪 المتجر تجريبي: مفيش CC اتخصم ولا رول اتعملت.',
    ].join('\n'), { color });
    if (iconUrl) embed.thumbnail = { url: iconUrl };
    return embed;
}

export function customRoleReceiptEmbed(user, item, result) {
    const lines = [
        `${user} ${result.voucher ? 'عمل' : 'اشترى'} **${item.emoji || ''} ${item.name}**: <@&${result.role.id}>`,
        ...(result.voucher ? ['🎟️ أول شهر ببلاش من صندوق الحظ.'] : []),
        '',
        `⏰ بتتجدد ${timestamp(result.record.paidUntil)} بـ ${formatCC(item.price)} من رصيدك.`,
        '🛑 `رولي الغي` يوقف التجديد (الرول بتفضل لآخر الشهر المدفوع).',
    ];
    if (item.kind === 'friends') lines.push(`👥 \`رولي انفايت @صاحبك\` تضيف لحد ${item.maxMembers - 1} من صحابك.`);
    if (result.iconSkipped) lines.push('', '⚠️ الأيقونة ما اتحطتش (السيرفر مش بوست لفل 2 أو الصورة مش مناسبة).');
    return ccEmbed('✅ الرول بتاعتك جاهزة', lines.join('\n'), {
        color: 'success',
        fields: [{ name: '💰 رصيدك دلوقتي', value: formatCC(result.balance), inline: true }],
    });
}

/** The invite: only `targetId` can press the buttons, until it expires. */
export function invitePayload(record, leaderId, targetId, now = Date.now()) {
    const sentAt = Math.floor(now / 1000);
    const expires = now + customRoleSettings.inviteHours * 60 * 60 * 1000;
    const embed = ccEmbed('📨 دعوة لرول', [
        `<@${targetId}>، <@${leaderId}> بيدعوك تنضم لرول <@&${record.roleId}>.`,
        '',
        `👥 الأعضاء: ${record.members.length}/${record.maxMembers}`,
        `⏰ الدعوة بتخلص ${timestamp(expires)}`,
    ].join('\n'));
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CUSTOM_ROLE_PREFIX}:accept:${record.roleId}:${targetId}:${sentAt}`).setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${CUSTOM_ROLE_PREFIX}:decline:${record.roleId}:${targetId}:${sentAt}`).setLabel('رفض').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
    return { content: `<@${targetId}>`, embeds: [embed], components: [row], allowedMentions: { users: [targetId] } };
}

const KIND_LABEL = { personal: '🎨 رول شخصية', friends: '👥 رول صحاب' };

/** `رولي`: every custom role the member is in, with its members, leader and renewal. */
export function myRolesEmbed(user, records, now = Date.now()) {
    if (!records.length) {
        return ccEmbed('🎨 رولي', `${user}\n\nمعندكش رول مميزة لسه. اكتب \`متجر\` وشوف الرولات 🛍️`);
    }
    const fields = records.map((record) => {
        const leads = record.leaderId === user.id;
        const status = record.cancelled
            ? `🛑 التجديد متوقف، الرول بتتمسح ${timestamp(record.paidUntil)}`
            : record.graceUntil && now >= record.paidUntil
                ? `⚠️ ما اتجددتش، بتتمسح ${timestamp(record.graceUntil)} لو الرصيد ما كفّاش`
                : `⏰ بتتجدد ${timestamp(record.paidUntil)} بـ ${formatCC(record.price)}`;
        const lines = [`<@&${record.roleId}>`, `👑 المسؤول: <@${record.leaderId}>${leads ? ' (إنت)' : ''}`, status];
        if (record.kind === 'friends') lines.push(`👥 ${record.members.length}/${record.maxMembers}: ${record.members.map((id) => `<@${id}>`).join(' ')}`.slice(0, 700));
        return { name: `${KIND_LABEL[record.kind] || '🎨 رول'} ・ ${record.name}`.slice(0, 256), value: lines.join('\n').slice(0, 1024) };
    });
    fields.push({
        name: '⌨️ الأوامر',
        value: ['👇 استخدم الزراير تحت، أو اكتب:', '`رولي انفايت @عضو` تضيف صاحبك', '`رولي شيل @عضو` تشيله', '`رولي ليدر @عضو` تسلمه الرول', '`رولي اخرج` تخرج من رول صحابك', '`رولي الغي` / `رولي كمل` توقف أو ترجع التجديد'].join('\n'),
    });
    return ccEmbed('🎨 رولي', `${user}`, { fields });
}

const button = (action, ownerId, roleId, label, emoji, style) => new ButtonBuilder()
    .setCustomId([MY_ROLE_PREFIX, action, ownerId, roleId].filter(Boolean).join(':'))
    .setLabel(label.slice(0, 80))
    .setEmoji(emoji)
    .setStyle(style);

/** The buttons of `رولي`: only what the member can do with each of their roles (at most 5 rows). */
export function myRolesComponents(userId, records) {
    const rows = [];
    const friends = records.find((record) => record.kind === 'friends' && record.leaderId === userId);
    const personal = records.find((record) => record.kind === 'personal' && record.leaderId === userId);
    const joined = records.filter((record) => record.kind === 'friends' && record.leaderId !== userId);
    const renew = (record, suffix) => (record.cancelled
        ? button('resume', userId, record.roleId, `رجّع التجديد${suffix}`, '▶️', ButtonStyle.Success)
        : button('cancel', userId, record.roleId, `وقف التجديد${suffix}`, '🛑', ButtonStyle.Danger));

    if (friends) {
        rows.push(new ActionRowBuilder().addComponents(
            button('invite', userId, friends.roleId, 'دعوة صاحب', '📨', ButtonStyle.Success).setDisabled(friends.members.length >= friends.maxMembers),
            button('kick', userId, friends.roleId, 'شيل عضو', '➖', ButtonStyle.Secondary).setDisabled(friends.members.length < 2),
            button('leader', userId, friends.roleId, 'سلّم الرول', '👑', ButtonStyle.Secondary).setDisabled(friends.members.length < 2),
            renew(friends, personal ? ' (الصحاب)' : ''),
        ));
    }
    if (personal) rows.push(new ActionRowBuilder().addComponents(renew(personal, friends ? ' (الشخصية)' : '')));
    for (let i = 0; i < joined.length && rows.length < 5; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(joined.slice(i, i + 5).map((record) => (
            button('leave', userId, record.roleId, `اخرج من ${record.name}`, '🚪', ButtonStyle.Secondary)))));
    }
    if (!records.length) rows.push(new ActionRowBuilder().addComponents(button('shop', userId, null, 'افتح المتجر', '🛍️', ButtonStyle.Primary)));
    return rows.slice(0, 5);
}

/** `رولي`: the member's roles and a button for each thing they can do. */
export function myRolesPayload(user, records, now = Date.now()) {
    return { embeds: [myRolesEmbed(user, records, now)], components: myRolesComponents(user.id, records), allowedMentions: { parse: [] } };
}

/** The picker for a friend to invite (any member of the server). */
export function invitePicker() {
    return new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
        .setCustomId(MY_ROLE_PICK.invite)
        .setPlaceholder('📨 اختار صاحبك اللي هتدعوه...')
        .setMinValues(1)
        .setMaxValues(1));
}

/** The picker for one of the role's members (not the leader): `members` is `[{ id, name }]`. */
export function memberPicker(action, members) {
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(MY_ROLE_PICK[action])
        .setPlaceholder(action === 'kick' ? '➖ اختار العضو اللي هتشيله...' : '👑 اختار العضو اللي هتسلّمه الرول...')
        .addOptions(members.slice(0, 25).map((member) => ({ label: member.name.slice(0, 100), value: member.id }))));
}

export function renewalChangedText(record, cancelled) {
    const until = timestamp(record.paidUntil);
    return cancelled
        ? `🛑 وقفت تجديد رول **${record.name}**. هتفضل معاك لحد ما تخلص ${until}، ولو غيرت رأيك دوس ▶️ أو اكتب \`رولي كمل\`.`
        : `✅ رجعت تجديد رول **${record.name}**، هتتجدد ${until}.`;
}
export const leftText = (record) => `🚪 خرجت من رول **${record.name}**.`;
export const kickedText = (memberId, record) => `✅ شيلت <@${memberId}> من رول **${record.name}**.`;
export const handedText = (memberId, record) => `👑 <@${memberId}> بقى المسؤول عن رول **${record.name}**، والتجديد بقى من رصيده.`;

const FAILURE_TEXT = {
    no_role: '❌ إنت مش مسؤول عن رول صحاب. تقدر تشتريها من `متجر`.',
    no_role_any: '❌ إنت مش مسؤول عن أي رول مميزة. اكتب `رولي` تشوف رولاتك.',
    bot: '❌ مينفعش تضيف بوت.',
    self: '❌ مينفعش تعمل كده لنفسك.',
    already: '❌ العضو ده في الرول أصلاً.',
    full: '❌ الرول مليانة.',
    not_member: '❌ العضو ده مش في الرول بتاعتك.',
    leads_one: '❌ العضو ده مسؤول عن رول صحاب تانية أصلاً.',
    none: '❌ إنت مش في رول صحاب.',
    pick: '❌ إنت في أكتر من رول. حدد الرول: اكتب `رولي` وشوفهم (`رولي اخرج @الرول`، `رولي الغي شخصي` أو `رولي الغي صحاب`).',
    leader: '❌ إنت المسؤول عن الرول. سلّمها لحد تاني بـ `رولي ليدر @عضو` أو وقف التجديد بـ `رولي الغي`.',
    gone: '❌ الرول دي مبقتش موجودة.',
    expired: '⌛ الدعوة دي خلصت.',
    give_failed: '❌ معرفتش أديك الرول، كلم الإدارة.',
    no_member: '❌ مش لاقي العضو ده في السيرفر.',
    not_yours: '❌ الزراير دي مش ليك. اكتب `رولي` تشوف رولاتك.',
    alone: '❌ مفيش أعضاء في الرول غيرك.',
    timeout: '⌛ الوقت خلص، دوس الزرار تاني.',
};

export function customRoleFailureText(result) {
    return FAILURE_TEXT[result.reason] || '❌ حصلت مشكلة، جرب تاني.';
}
