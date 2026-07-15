import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder,
  PollLayoutType, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getConfig } from '../../modules/community/store.js';
import { requireAccess, AccessLevel, memberAccessLevel } from '../../modules/community/permissions.js';
import { schedulePollClosure } from '../../services/communityPollService.js';

const descriptions = {
  suggest: 'שליחת הצעה לקהילה', feedback: 'שליחת משוב על השרת או הבוט', report: 'שליחת דיווח פרטי לצוות',
  poll: 'יצירת סקר קהילתי', selfpromo: 'פרסום עמוד היוצר שלך', lookingforeditor: 'פרסום חיפוש אחר עורך',
  lookingforteam: 'פרסום חיפוש אחר צוות', editingtype: 'בחירת תחומי העריכה שלך'
};
const modalFields = {
  suggest: [['title', 'כותרת ההצעה', TextInputStyle.Short, true], ['description', 'פירוט ההצעה', TextInputStyle.Paragraph, true]],
  feedback: [['category', 'סוג המשוב', TextInputStyle.Short, true, 'השרת / הבוט / הצוות / רעיון לשיפור / אחר'], ['content', 'תוכן המשוב', TextInputStyle.Paragraph, true]],
  report: [['type', 'סוג הדיווח', TextInputStyle.Short, true, 'משתמש / הודעה / הטרדה / ספאם / גניבת תוכן / בעיה טכנית / אחר'], ['reported_user', 'מזהה המשתמש המדווח (אם רלוונטי)', TextInputStyle.Short, false], ['description', 'תיאור המקרה', TextInputStyle.Paragraph, true], ['evidence', 'קישור להודעה או הוכחה (אופציונלי)', TextInputStyle.Short, false]],
  selfpromo: [['platform', 'פלטפורמה', TextInputStyle.Short, true, 'TikTok / YouTube / Instagram / Twitch / Portfolio / Other'], ['display_name', 'שם תצוגה', TextInputStyle.Short, true], ['link', 'קישור', TextInputStyle.Short, true], ['description', 'תיאור קצר', TextInputStyle.Paragraph, true]],
  lookingforeditor: [['video_type', 'סוג הסרטון והפלטפורמה', TextInputStyle.Short, true], ['deadline', 'מועד אחרון', TextInputStyle.Short, true], ['style', 'סגנון עריכה', TextInputStyle.Short, true], ['contact', 'דרך ליצירת קשר', TextInputStyle.Short, true], ['description', 'תיאור מלא', TextInputStyle.Paragraph, true]],
  lookingforteam: [['project', 'סוג הפרויקט והתפקידים הדרושים', TextInputStyle.Paragraph, true], ['deadline', 'מועד אחרון', TextInputStyle.Short, true], ['experience', 'ניסיון נדרש', TextInputStyle.Short, true], ['contact', 'דרך ליצירת קשר', TextInputStyle.Short, true], ['description', 'תיאור מלא', TextInputStyle.Paragraph, true]]
};

export function createModal(name, suffix = '') {
  const modal = new ModalBuilder().setCustomId(`community_form:${name}${suffix ? `:${suffix}` : ''}`).setTitle(descriptions[name]);
  modal.addComponents(...modalFields[name].map(([id, label, style, required, placeholder]) =>
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(style === TextInputStyle.Paragraph ? 1500 : 200).setPlaceholder(placeholder || label))
  ));
  return modal;
}

export function communityCommand(name) {
  const data = new SlashCommandBuilder().setName(name).setDescription(descriptions[name]).setDMPermission(false);
  if (name === 'feedback') data.addBooleanOption(o => o.setName('anonymous').setDescription('שליחת המשוב באופן אנונימי'));
  if (name === 'poll') {
    data.addStringOption(o => o.setName('question').setDescription('שאלת הסקר').setRequired(true).setMaxLength(300));
    for (let n = 1; n <= 2; n++) data.addStringOption(o => o.setName(`option_${n}`).setDescription(`אפשרות ${n}`).setRequired(true).setMaxLength(100));
    data.addStringOption(o => o.setName('duration').setDescription('משך: 10m, 2h, 1d (עד 7 ימים)').setRequired(true));
    data.addBooleanOption(o => o.setName('allow_multiple_choices').setDescription('לאפשר מספר בחירות').setRequired(true));
    for (let n = 3; n <= 5; n++) data.addStringOption(o => o.setName(`option_${n}`).setDescription(`אפשרות ${n}`).setMaxLength(100));
  }
  if (['lookingforeditor', 'lookingforteam'].includes(name)) {
    data.addBooleanOption(o => o.setName('paid').setDescription('האם העבודה בתשלום?').setRequired(true));
    if (name === 'lookingforeditor') data.addStringOption(o => o.setName('budget').setDescription('תקציב או טווח תקציב (חובה לעבודה בתשלום)').setMaxLength(100));
  }
  return { data, async execute(interaction, client) {
    const config = await getConfig(client, interaction.guildId);
    if (config.community.enabled === false) return interaction.reply({ content: 'מודול פקודות הקהילה מושבת.', flags: MessageFlags.Ephemeral });
    let required = name === 'poll' && config.community.publicPolls ? AccessLevel.EVERYONE : name === 'poll' ? AccessLevel.HELPER : AccessLevel.VERIFIED;
    if (!await requireAccess(interaction, client, required)) return;
    if (name === 'editingtype') {
      const roles = (config.community.editingRoleIds || []).map(id => interaction.guild.roles.cache.get(id)).filter(role => role && !role.managed && role.position < interaction.guild.members.me.roles.highest.position);
      if (!roles.length) return interaction.reply({ content: 'תפקידי העריכה עדיין לא הוגדרו.', flags: MessageFlags.Ephemeral });
      const menu = new StringSelectMenuBuilder().setCustomId(`editing_roles:${interaction.user.id}`).setPlaceholder('בחרו את תחומי העריכה שלכם').setMinValues(0).setMaxValues(roles.length).addOptions(roles.map(role => ({ label: role.name, value: role.id, default: interaction.member.roles.cache.has(role.id) })));
      return interaction.reply({ embeds: [createEmbed({ title: '🎨 תחומי עריכה', description: 'בחרו את כל תחומי העריכה המתאימים לכם. הבחירה תחליף את הבחירה הקודמת.', color: 'primary' })], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }
    if (name === 'poll') return createPoll(interaction, client, config);
    if (name === 'feedback' && interaction.options.getBoolean('anonymous') && !config.community.anonymousFeedback) return interaction.reply({ content: 'משוב אנונימי אינו מופעל בשרת זה.', flags: MessageFlags.Ephemeral });
    let suffix = name === 'feedback' && interaction.options.getBoolean('anonymous') ? 'anonymous' : '';
    if (['lookingforeditor', 'lookingforteam'].includes(name)) {
      const paid = interaction.options.getBoolean('paid');
      const budget = interaction.options.getString('budget');
      if (name === 'lookingforeditor' && paid && !budget) return interaction.reply({ content: 'בעבודה בתשלום חובה לציין תקציב או טווח תקציב.', flags: MessageFlags.Ephemeral });
      suffix = Buffer.from(JSON.stringify({ paid, budget })).toString('base64url');
    }
    return interaction.showModal(createModal(name, suffix));
  } };
}

export function parseDuration(value) {
  const match = /^(\d+)(m|h|d)$/i.exec(value || '');
  if (!match) return null;
  const ms = Number(match[1]) * ({ m: 60000, h: 3600000, d: 86400000 })[match[2].toLowerCase()];
  return ms >= 600000 && ms <= 604800000 ? ms : null;
}

async function createPoll(interaction, client) {
  const duration = parseDuration(interaction.options.getString('duration'));
  if (!duration) return interaction.reply({ content: 'משך הסקר אינו תקין. השתמשו לדוגמה ב־10m, 2h או 1d (עד 7 ימים).', flags: MessageFlags.Ephemeral });
  const options = Array.from({ length: 5 }, (_, index) => interaction.options.getString(`option_${index + 1}`)?.trim()).filter(Boolean);
  if (new Set(options.map(v => v.toLowerCase())).size !== options.length) return interaction.reply({ content: 'אפשרויות הסקר חייבות להיות שונות זו מזו.', flags: MessageFlags.Ephemeral });
  const id = String(await client.db.increment(`community:${interaction.guildId}:sequence:poll`));
  const nativePoll = Boolean(PollLayoutType?.Default) && duration >= 3600000;
  const record = { id, authorId: interaction.user.id, question: interaction.options.getString('question'), options, votes: {}, multiple: interaction.options.getBoolean('allow_multiple_choices'), nativePoll, status: 'open', createdAt: Date.now(), closesAt: Date.now() + duration };
  await client.db.set(`community:${interaction.guildId}:poll:${id}`, record);
  const buttons = options.map((option, index) => new ButtonBuilder().setCustomId(`community_vote:poll:${id}:${index}`).setLabel(`${index + 1}`).setStyle(ButtonStyle.Primary));
  const message = await interaction.channel.send(nativePoll ? {
    content: `📊 **סקר #${id}** — נוצר על ידי ${interaction.user}`,
    poll: { question: { text: record.question }, answers: options.map(text => ({ text })), duration: Math.ceil(duration / 3600000), allowMultiselect: record.multiple, layoutType: PollLayoutType.Default }
  } : { embeds: [createEmbed({ title: `📊 ${record.question}`, description: options.map((option, index) => `**${index + 1}.** ${option}`).join('\n'), footer: { text: `סקר #${id} • נסגר בעוד ${interaction.options.getString('duration')}` }, color: 'primary' })], components: [new ActionRowBuilder().addComponents(buttons)] });
  record.messageId = message.id; record.channelId = message.channelId; await client.db.set(`community:${interaction.guildId}:poll:${id}`, record);
  schedulePollClosure(client, interaction.guildId, id, record.closesAt);
  return interaction.reply({ content: `הסקר פורסם בהצלחה ב־${interaction.channel}.`, flags: MessageFlags.Ephemeral });
}
