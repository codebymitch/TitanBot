import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
export function utilityCommand(name) {
 const data=new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false).addStringOption(o=>o.setName('title').setDescription('Title').setRequired(true).setMaxLength(256)).addStringOption(o=>o.setName('content').setDescription('Content').setRequired(true).setMaxLength(4000)).addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText));
 return {data,async execute(i,client){if(!await requireAccess(i,client,AccessLevel.ADMIN))return;const channel=i.options.getChannel('channel')||i.channel;await channel.send({embeds:[createEmbed({title:i.options.getString('title'),description:i.options.getString('content'),color:name==='announce'?'warning':'primary'})]});await i.reply({content:`ההודעה פורסמה ב-${channel}.`,flags:MessageFlags.Ephemeral});}};
}
