import { ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { memberAccessLevel, AccessLevel } from '../../community/permissions.js';
import { getConfig } from '../../community/store.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';

const key = (guildId, kind, id) => `community:${guildId}:${kind}:${id}`;
const counts = record => record.options?.map((_, index) => Object.values(record.votes || {}).filter(v => (Array.isArray(v) ? v : [v]).includes(index)).length) || [];

const vote = { name: 'community_vote', async execute(interaction, client, args) {
  const [kind, id, choice] = args;
  const record = await client.db.get(key(interaction.guildId, kind, id));
  if (!record || record.status !== 'open') return interaction.reply({ content: 'ההצבעה אינה פעילה.', flags: MessageFlags.Ephemeral });
  if (record.closesAt && Date.now() >= record.closesAt) return interaction.reply({ content: 'הסקר כבר הסתיים.', flags: MessageFlags.Ephemeral });
  record.votes ||= {};
  if (kind === 'suggest') {
    if (record.votes[interaction.user.id] === choice) return interaction.reply({ content: 'כבר הצבעת באפשרות זו.', flags: MessageFlags.Ephemeral });
    record.votes[interaction.user.id] = choice;
  } else {
    const option = Number(choice);
    const previous = record.votes[interaction.user.id];
    if (!record.multiple) {
      if (previous === option) return interaction.reply({ content: 'כבר הצבעת לאפשרות זו.', flags: MessageFlags.Ephemeral });
      record.votes[interaction.user.id] = option;
    } else {
      const selected = Array.isArray(previous) ? previous : [];
      record.votes[interaction.user.id] = selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option];
    }
  }
  await client.db.set(key(interaction.guildId, kind, id), record);
  const config = await getConfig(client, interaction.guildId);
  let content = 'ההצבעה שלך נשמרה.';
  if (config.community.publicVoteTotals) content += kind === 'suggest'
    ? ` בעד: ${Object.values(record.votes).filter(v => v === 'up').length} | נגד: ${Object.values(record.votes).filter(v => v === 'down').length}`
    : ` תוצאות: ${counts(record).map((total, index) => `${index + 1}: ${total}`).join(' | ')}`;
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
} };

const status = { name: 'community_status', async execute(interaction, client, args) {
  const [kind, id, nextStatus] = args;
  const required = kind === 'report' ? AccessLevel.MODERATOR : AccessLevel.HELPER;
  if (await memberAccessLevel(interaction, client) < required) return interaction.reply({ content: 'אין לך הרשאה להשתמש בכפתור הזה.', flags: MessageFlags.Ephemeral });
  const record = await client.db.get(key(interaction.guildId, kind, id));
  if (!record) return interaction.reply({ content: 'הרשומה אינה קיימת.', flags: MessageFlags.Ephemeral });
  const previous = record.status; record.status = nextStatus; record.handlerId = interaction.user.id; record.updatedAt = Date.now();
  await client.db.set(key(interaction.guildId, kind, id), record);
  const embed = createEmbed({ title: interaction.message.embeds[0]?.title || `רשומה #${id}`, description: interaction.message.embeds[0]?.description || '', fields: interaction.message.embeds[0]?.fields || [], color: ['approved', 'completed', 'resolved'].includes(nextStatus) ? 'success' : nextStatus === 'rejected' || nextStatus === 'closed' ? 'error' : 'warning', footer: { text: `סטטוס: ${nextStatus} • מטפל: ${interaction.user.username}` } });
  await interaction.update({ embeds: [embed], components: interaction.message.components });
  await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.SETTINGS_CHANGE, data: { title: `שינוי סטטוס ${kind} #${id}`, description: `${previous} → ${nextStatus} על ידי <@${interaction.user.id}>.` } });
} };

const interest = { name: 'community_interest', async execute(interaction, client, args) {
  const [kind, id] = args; const record = await client.db.get(key(interaction.guildId, kind, id));
  if (!record || record.status !== 'open') return interaction.reply({ content: 'הפרסום אינו פעיל.', flags: MessageFlags.Ephemeral });
  if (record.authorId === interaction.user.id) return interaction.reply({ content: 'לא ניתן להביע עניין בפרסום של עצמך.', flags: MessageFlags.Ephemeral });
  const author = await client.users.fetch(record.authorId).catch(() => null);
  if (!author) return interaction.reply({ content: 'לא ניתן ליצור קשר עם מפרסם הבקשה.', flags: MessageFlags.Ephemeral });
  await author.send({ embeds: [createEmbed({ title: `התעניינות בפרסום #${id}`, description: `${interaction.user} מעוניין/ת בפרסום שלך.\nמזהה משתמש: \`${interaction.user.id}\``, color: 'success' })] }).catch(() => null);
  return interaction.reply({ content: 'פרטי ההתעניינות נשלחו למפרסם באופן פרטי.', flags: MessageFlags.Ephemeral });
} };

const contact = { name: 'community_contact', async execute(interaction, client, args) {
  const [kind, id] = args; const record = await client.db.get(key(interaction.guildId, kind, id));
  if (!record) return interaction.reply({ content: 'הפרסום אינו קיים.', flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [createEmbed({ title: 'יצירת קשר', description: record.contact || `<@${record.authorId}>`, color: 'primary' })], flags: MessageFlags.Ephemeral });
} };

const close = { name: 'community_close', async execute(interaction, client, args) {
  const [kind, id] = args; const record = await client.db.get(key(interaction.guildId, kind, id));
  if (!record) return interaction.reply({ content: 'הפרסום אינו קיים.', flags: MessageFlags.Ephemeral });
  const staff = await memberAccessLevel(interaction, client) >= AccessLevel.MODERATOR;
  if (record.authorId !== interaction.user.id && !staff) return interaction.reply({ content: 'רק המפרסם או צוות הניהול יכולים לסגור את הפרסום.', flags: MessageFlags.Ephemeral });
  record.status = 'closed'; record.closedBy = interaction.user.id; await client.db.set(key(interaction.guildId, kind, id), record);
  const disabled = interaction.message.components.map(row => ({ type: 1, components: row.components.map(button => ButtonBuilder.from(button).setDisabled(true)) }));
  await interaction.update({ components: disabled });
  await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.SETTINGS_CHANGE, data: { title: `פרסום #${id} נסגר`, description: `נסגר על ידי <@${interaction.user.id}>.` } });
} };

export default [vote, status, interest, contact, close];
