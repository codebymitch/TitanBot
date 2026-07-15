import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getConfig } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

export function communityCommand(name) {
  const data = new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false)
    .addStringOption(o => o.setName('content').setDescription('Content').setRequired(true).setMaxLength(1500));
  if (name === 'poll') data.addStringOption(o => o.setName('options').setDescription('Options separated with | (2-10)').setRequired(true));
  return { data, async execute(i, client) {
    const level = name === 'poll' ? AccessLevel.HELPER : AccessLevel.VERIFIED;
    if (!await requireAccess(i, client, level)) return;
    const content = i.options.getString('content');
    const pollOptions = name === 'poll' ? i.options.getString('options').split('|').map(v=>v.trim()).filter(Boolean).slice(0,10) : [];
    if (name === 'poll' && pollOptions.length < 2) return i.reply({ content:'יש לספק לפחות שתי אפשרויות מופרדות באמצעות |.', flags:MessageFlags.Ephemeral });
    const config = await getConfig(client, i.guildId);
    const channelId = config.channels?.[{ suggest:'suggestions', report:'reports', feedback:'feedback' }[name]];
    const channel = channelId ? i.guild.channels.cache.get(channelId) : i.channel;
    if (!channel?.isTextBased()) return i.reply({ content: 'ערוץ היעד אינו זמין.', flags: MessageFlags.Ephemeral });
    const titles = { suggest:'הצעה חדשה', report:'דיווח חדש', feedback:'משוב חדש', poll:'סקר חדש' };
    const embed = createEmbed({ title: titles[name], description: content, color: name === 'report' ? 'warning' : 'primary' }).setFooter({ text: `נשלח על ידי ${i.user.username}` });
    const message = await channel.send({ embeds: [embed] });
    if (name === 'poll') {
      const options = pollOptions;
      const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      embed.setFields({ name:'אפשרויות', value:options.map((v,n)=>`${emojis[n]} ${v}`).join('\n') }); await message.edit({embeds:[embed]});
      for (let n=0;n<options.length;n++) await message.react(emojis[n]);
    } else if (name === 'suggest') { await message.react('👍'); await message.react('👎'); }
    await i.reply({ embeds:[createEmbed({title:'נשלח בהצלחה',description:`התוכן פורסם ב-${channel}.`,color:'success'})], flags:MessageFlags.Ephemeral });
  }};
}
