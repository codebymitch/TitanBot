import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  version as discordVersion
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel, memberAccessLevel } from '../../modules/community/permissions.js';
import { getConfig } from '../../modules/community/store.js';
import packageJson from '../../../package.json' with { type: 'json' };

export const HELP_CATEGORIES = Object.freeze({
  general: { label: 'כללי', emoji: '📚', directories: ['general'] },
  community: { label: 'קהילה', emoji: '👥', directories: ['community', 'contests', 'roles'] },
  leveling: { label: 'רמות', emoji: '⭐', directories: ['levels'], names: ['level'] },
  tickets: { label: 'פניות', emoji: '🎫', directories: ['tickets'], names: ['ticket'] },
  moderation: { label: 'ניהול', emoji: '🛡️', directories: ['moderation'], names: ['moderation'] },
  settings: { label: 'הגדרות', emoji: '⚙️', directories: ['admin', 'owner'] }
});

const descriptions = {
  help: 'הצגת מרכז העזרה והפקודות הזמינות', ping: 'בדיקת זמני תגובה ומסד הנתונים',
  botinfo: 'הצגת מידע וסטטיסטיקות על הבוט', serverinfo: 'הצגת מידע על השרת',
  userinfo: 'הצגת מידע על חבר בשרת', avatar: 'הצגת תמונת פרופיל ברזולוציה מלאה'
};
const base = name => new SlashCommandBuilder().setName(name).setDescription(descriptions[name]).setDMPermission(false);
const discordDate = timestamp => timestamp ? `<t:${Math.floor(timestamp / 1000)}:F>` : 'לא זמין';

export function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days && `${days} ימים`, hours && `${hours} שעות`, `${minutes} דקות`].filter(Boolean).join(', ');
}

function categoryFor(command) {
  const name = command.data.name;
  return Object.entries(HELP_CATEGORIES).find(([, value]) =>
    value.names?.includes(name) || (value.directories.includes(command.category) && !Object.values(HELP_CATEGORIES).some(other => other.names?.includes(name)))
  )?.[0];
}

function defaultAccessFor(command) {
  if (command.data.name === 'staffhelp') return AccessLevel.HELPER;
  if (command.category === 'owner') return AccessLevel.OWNER;
  if (command.category === 'moderation') return AccessLevel.MODERATOR;
  if (command.category === 'tickets') return AccessLevel.HELPER;
  if (command.category === 'levels') return AccessLevel.EVERYONE;
  if (command.category === 'community' || command.category === 'contests') return AccessLevel.EVERYONE;
  if (command.category === 'roles') return AccessLevel.ADMIN;
  return AccessLevel.EVERYONE;
}

export async function getVisibleHelpCommands(interaction, client) {
  const [level, config] = await Promise.all([
    memberAccessLevel(interaction, client),
    getConfig(client, interaction.guildId)
  ]);
  return [...client.commands.values()].filter(command => {
    const data = command.data.toJSON();
    if (!categoryFor(command) || config.commandSettings?.[data.name]?.enabled === false) return false;
    const configuredLevel = Number(config.commandPermissions?.[data.name] ?? defaultAccessFor(command));
    if (level < configuredLevel) return false;
    if (data.default_member_permissions && !interaction.member.permissions.has(BigInt(data.default_member_permissions))) return false;
    return true;
  });
}

export function createHelpView(commands, category = null, userId = null) {
  const grouped = Object.fromEntries(Object.keys(HELP_CATEGORIES).map(key => [key, commands.filter(command => categoryFor(command) === key)]));
  const selected = category && HELP_CATEGORIES[category] ? category : null;
  const section = selected ? grouped[selected] : commands;
  const embed = createEmbed({
    title: selected ? `${HELP_CATEGORIES[selected].emoji} ${HELP_CATEGORIES[selected].label}` : '📚 מרכז העזרה — EditIL Assistant',
    description: selected
      ? (section.map(command => `**/${command.data.name}** — ${command.data.description}`).join('\n') || 'אין פקודות זמינות בקטגוריה זו.')
      : 'בחרו קטגוריה מהתפריט כדי לראות רק את הפקודות הזמינות עבורכם.',
    fields: selected ? [] : Object.entries(HELP_CATEGORIES).map(([key, value]) => ({
      name: `${value.emoji} ${value.label}`,
      value: `${grouped[key].length} פקודות זמינות`,
      inline: true
    })),
    color: 'primary',
    footer: { text: 'התפריט מציג פקודות בהתאם להרשאות שלך' }
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`general_help:${userId || 'unknown'}`)
    .setPlaceholder('בחרו קטגוריה')
    .addOptions(Object.entries(HELP_CATEGORIES).map(([value, item]) => ({
      label: item.label, value, emoji: item.emoji,
      description: `${grouped[value].length} פקודות זמינות`, default: value === selected
    })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral };
}

export function generalCommand(name) {
  const data = base(name);
  if (['userinfo', 'avatar'].includes(name)) {
    data.addUserOption(option => option.setName('member').setDescription('החבר שעבורו יוצג המידע').setRequired(false));
  }
  return { data, async execute(interaction, client) {
    if (!await requireAccess(interaction, client, AccessLevel.EVERYONE)) return;
    if (name === 'help') {
      const commands = await getVisibleHelpCommands(interaction, client);
      return interaction.reply(createHelpView(commands, null, interaction.user.id));
    }

    const guild = interaction.guild;
    const user = interaction.options.getUser('member') || interaction.user;
    let embed;
    let components = [];
    if (name === 'ping') {
      const botLatency = Math.max(0, Date.now() - interaction.createdTimestamp);
      const apiLatency = Math.max(0, Math.round(client.ws.ping));
      const status = client.db.getStatus?.() || {};
      const databaseUp = client.db.isAvailable?.() ?? (!status.isDegraded && status.connectionType === 'postgresql');
      embed = createEmbed({ title: '🏓 בדיקת תקשורת', fields: [
        { name: '🏓 זמן תגובת הבוט', value: `**${botLatency}ms**`, inline: true },
        { name: '🌐 זמן תגובת Discord API', value: `**${apiLatency}ms**`, inline: true },
        { name: '🗄️ מסד נתונים', value: databaseUp ? '**מחובר ופעיל**' : '**לא זמין — מצב זמני**', inline: false }
      ], color: databaseUp ? 'success' : 'warning' });
    } else if (name === 'botinfo') {
      const users = client.guilds.cache.reduce((sum, item) => sum + (item.memberCount || 0), 0);
      const developer = process.env.DEVELOPER_NAME || (process.env.DEVELOPER_ID ? `<@${process.env.DEVELOPER_ID}>` : 'צוות EditIL');
      embed = createEmbed({ title: `🤖 מידע על ${client.user.username}`, thumbnail: client.user.displayAvatarURL({ size: 512 }), color: 'primary', fields: [
        { name: 'שם הבוט', value: client.user.username, inline: true }, { name: 'גרסה', value: packageJson.version, inline: true },
        { name: 'מפתח', value: developer, inline: true }, { name: 'ספרייה', value: `discord.js ${discordVersion}`, inline: true },
        { name: 'Ping', value: `${Math.max(0, Math.round(client.ws.ping))}ms`, inline: true }, { name: 'שרתים', value: String(client.guilds.cache.size), inline: true },
        { name: 'משתמשים', value: users.toLocaleString('he-IL'), inline: true }, { name: 'פקודות טעונות', value: String(client.commands.size), inline: true },
        { name: 'זמן פעילות', value: formatUptime(client.uptime / 1000), inline: false }
      ] });
    } else if (name === 'serverinfo') {
      // Refresh the member cache when the privileged guild-members intent is available;
      // if it is not, Discord's reported member count and the current cache remain usable.
      await guild.members.fetch().catch(() => null);
      const bots = guild.members.cache.filter(member => member.user.bot).size;
      embed = createEmbed({ title: `🌐 ${guild.name}`, thumbnail: guild.iconURL({ size: 1024 }), color: 'primary', fields: [
        { name: 'בעלים', value: `<@${guild.ownerId}>`, inline: true }, { name: 'חברים', value: guild.memberCount.toLocaleString('he-IL'), inline: true },
        { name: 'בוטים', value: bots.toLocaleString('he-IL'), inline: true }, { name: 'תפקידים', value: String(guild.roles.cache.size), inline: true },
        { name: 'ערוצים', value: String(guild.channels.cache.size), inline: true }, { name: 'רמת Boost', value: String(guild.premiumTier), inline: true },
        { name: 'Boosts', value: String(guild.premiumSubscriptionCount || 0), inline: true }, { name: 'תאריך יצירה', value: discordDate(guild.createdTimestamp), inline: false }
      ] });
    } else if (name === 'userinfo') {
      const member = await guild.members.fetch(user.id).catch(() => null);
      embed = createEmbed({ title: `👤 מידע על ${user.username}`, thumbnail: user.displayAvatarURL({ size: 1024 }), color: 'primary', fields: [
        { name: 'שם תצוגה', value: member?.displayName || user.globalName || user.username, inline: true }, { name: 'שם משתמש', value: user.username, inline: true },
        { name: 'הצטרפות לשרת', value: discordDate(member?.joinedTimestamp), inline: false }, { name: 'יצירת החשבון', value: discordDate(user.createdTimestamp), inline: false },
        { name: 'התפקיד הגבוה ביותר', value: member?.roles.highest?.id === guild.id ? 'ללא תפקיד' : String(member?.roles.highest || 'לא זמין'), inline: true },
        { name: 'מזהה חבר', value: `\`${user.id}\``, inline: true }
      ] });
    } else if (name === 'avatar') {
      const extension = user.avatar?.startsWith('a_') ? 'gif' : 'png';
      const url = user.displayAvatarURL({ size: 4096, extension });
      embed = createEmbed({ title: `🖼️ תמונת הפרופיל של ${user.username}`, description: 'לחצו על הכפתור כדי לפתוח את התמונה בגודל מלא.', image: url, color: 'primary' });
      components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('פתיחת התמונה').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(url))];
    }
    return interaction.reply({ embeds: [embed], components });
  } };
}
