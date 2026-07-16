import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { levelKey } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
import { clampCommunityXp, communityLevelFromXp, MAX_COMMUNITY_XP } from '../../utils/levelLimits.js';

const descriptions = {
  leaderboard: 'הצגת טבלת המובילים בשרת',
  profile: 'הצגת פרופיל העורך שלך או של חבר אחר',
  rank: 'הצגת הרמה והניסיון שלך או של חבר אחר',
  resetxp: 'איפוס נתוני הניסיון של חבר',
  setxp: 'עדכון כמות הניסיון של חבר'
};

export function levelCommand(name) {
  const data = new SlashCommandBuilder().setName(name).setDescription(descriptions[name]).setDMPermission(false);
  if (name === 'setxp') data.addIntegerOption(option => option.setName('xp').setDescription('כמות XP').setRequired(true).setMinValue(0).setMaxValue(MAX_COMMUNITY_XP));
  if (name !== 'leaderboard') data.addUserOption(option => option.setName('member').setDescription('החבר המבוקש'));

  return {
    data,
    async execute(interaction, client) {
      const adminCommand = ['setxp', 'resetxp'].includes(name);
      if (!await requireAccess(interaction, client, adminCommand ? AccessLevel.ADMIN : AccessLevel.EVERYONE)) return;

      if (name === 'leaderboard') {
        const keys = await client.db.list(`community:${interaction.guildId}:level:`);
        const rows = await Promise.all((keys || []).map(async key => {
          const value = await client.db.get(key, { xp: 0, level: 0 });
          const xp = clampCommunityXp(value.xp);
          return { id: key.split(':').pop(), ...value, xp, level: communityLevelFromXp(xp) };
        }));
        const board = rows.sort((a, b) => b.xp - a.xp).slice(0, 10);
        return interaction.reply({ embeds: [createEmbed({
          title: '🏆 טבלת המובילים',
          description: board.length ? board.map((entry, index) => `**${index + 1}.** <@${entry.id}> — ${entry.xp} XP (רמה ${entry.level})`).join('\n') : 'עדיין אין נתוני רמות.',
          color: 'primary'
        })] });
      }

      const user = interaction.options.getUser('member') || interaction.user;
      const key = levelKey(interaction.guildId, user.id);
      if (name === 'setxp') {
        const xp = clampCommunityXp(interaction.options.getInteger('xp'));
        await client.db.set(key, { xp, level: communityLevelFromXp(xp), last: 0 });
        return interaction.reply({ content: `ה־XP של ${user} עודכן ל־${xp}.`, flags: MessageFlags.Ephemeral });
      }
      if (name === 'resetxp') {
        await client.db.delete(key);
        return interaction.reply({ content: `נתוני הרמה של ${user} אופסו.`, flags: MessageFlags.Ephemeral });
      }
      const value = await client.db.get(key, { xp: 0, level: 0 });
      const xp = clampCommunityXp(value.xp);
      const level = communityLevelFromXp(xp);
      return interaction.reply({ embeds: [createEmbed({ title: name === 'profile' ? 'פרופיל עורך' : 'דירוג', description: `${user}\nרמה: **${level}**\nניסיון: **${xp} XP**`, color: 'primary' }).setThumbnail(user.displayAvatarURL())], flags: MessageFlags.Ephemeral });
    }
  };
}
