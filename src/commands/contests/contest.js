import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getConfig, updateConfig } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

const durations={h6:21600000,d1:86400000,d3:259200000,d7:604800000};
export default {
  data:new SlashCommandBuilder().setName('contest').setDescription('ניהול תחרויות עריכה').setDMPermission(false)
    .addSubcommand(s=>s.setName('create').setDescription('יצירת תחרות חדשה').addStringOption(o=>o.setName('title').setDescription('כותרת התחרות').setRequired(true).setMaxLength(100)).addStringOption(o=>o.setName('description').setDescription('תיאור וכללי התחרות').setRequired(true).setMaxLength(1000)).addStringOption(o=>o.setName('duration').setDescription('משך התחרות').setRequired(true).addChoices({name:'6 שעות',value:'h6'},{name:'יום',value:'d1'},{name:'3 ימים',value:'d3'},{name:'7 ימים',value:'d7'})))
    .addSubcommand(s=>s.setName('submit').setDescription('הגשת עבודה לתחרות').addStringOption(o=>o.setName('url').setDescription('קישור לעבודה').setRequired(true)))
    .addSubcommand(s=>s.setName('vote').setDescription('הצבעה להגשה').addIntegerOption(o=>o.setName('number').setDescription('מספר ההגשה').setRequired(true).setMinValue(1)))
    .addSubcommand(s=>s.setName('status').setDescription('הצגת מצב התחרות וההגשות'))
    .addSubcommand(s=>s.setName('end').setDescription('סיום התחרות ופרסום תוצאות')),
  async execute(i,c){
    const sub=i.options.getSubcommand(),admin=['create','end'].includes(sub);
    if(!await requireAccess(i,c,admin?AccessLevel.ADMIN:AccessLevel.EVERYONE,`contest.${sub}`))return;
    const config=await getConfig(c,i.guildId),state=config.contests;
    if(sub==='create'){
      if(state.active)return i.reply({content:'כבר קיימת תחרות פעילה.',flags:MessageFlags.Ephemeral});
      const duration=durations[i.options.getString('duration')],active={title:i.options.getString('title'),description:i.options.getString('description'),createdAt:Date.now(),endsAt:Date.now()+duration};
      await updateConfig(c,i.guildId,{contests:{active,submissions:[],votes:{}}});
      return i.reply({embeds:[createEmbed({title:`🏆 תחרות: ${active.title}`,description:`${active.description}\n\n**מועד סיום:** <t:${Math.floor(active.endsAt/1000)}:R>`,color:'primary'})]});
    }
    if(!state.active)return i.reply({content:'אין תחרות פעילה.',flags:MessageFlags.Ephemeral});
    const endsAt=Number(state.active.endsAt)||Number(state.active.createdAt)+durations.d7;
    if(sub==='status')return i.reply({embeds:[createEmbed({title:`🏆 ${state.active.title}`,description:`${state.active.description}\n\nסיום: <t:${Math.floor(endsAt/1000)}:R>\nהגשות: **${state.submissions.length}**\nמצביעים: **${Object.keys(state.votes).length}**`,fields:state.submissions.slice(0,10).map((s,n)=>({name:`הגשה ${n+1}`,value:`<@${s.userId}> • [צפייה](${s.url})`,inline:true})),color:'primary'})],flags:MessageFlags.Ephemeral});
    if(Date.now()>=endsAt&&sub!=='end')return i.reply({content:'מועד התחרות הסתיים. מנהל יכול לפרסם את התוצאות באמצעות `/contest end`.',flags:MessageFlags.Ephemeral});
    if(sub==='submit'){
      const url=i.options.getString('url');if(!/^https?:\/\/\S+$/i.test(url))return i.reply({content:'יש לצרף קישור תקין לעבודה.',flags:MessageFlags.Ephemeral});
      if(state.submissions.some(s=>s.userId===i.user.id))return i.reply({content:'כבר הגשת עבודה לתחרות זו.',flags:MessageFlags.Ephemeral});
      const submissions=[...state.submissions,{userId:i.user.id,url,createdAt:Date.now()}];await updateConfig(c,i.guildId,{contests:{submissions}});return i.reply({content:`העבודה התקבלה כהגשה מספר **${submissions.length}**.`,flags:MessageFlags.Ephemeral});
    }
    if(sub==='vote'){
      const number=i.options.getInteger('number'),submission=state.submissions[number-1];if(!submission)return i.reply({content:'מספר ההגשה אינו קיים.',flags:MessageFlags.Ephemeral});
      if(submission.userId===i.user.id)return i.reply({content:'לא ניתן להצביע לעבודה של עצמך.',flags:MessageFlags.Ephemeral});
      const votes={...state.votes,[i.user.id]:number};await updateConfig(c,i.guildId,{contests:{votes}});return i.reply({content:`הצבעת להגשה מספר **${number}**.`,flags:MessageFlags.Ephemeral});
    }
    const counts={};for(const n of Object.values(state.votes))counts[n]=(counts[n]||0)+1;
    const results=state.submissions.map((s,n)=>({n:n+1,...s,votes:counts[n+1]||0})).sort((a,b)=>b.votes-a.votes),winner=results[0];
    await updateConfig(c,i.guildId,{contests:{active:null,submissions:[],votes:{}}});
    return i.reply({embeds:[createEmbed({title:`🏆 תוצאות — ${state.active.title}`,description:winner?`**המנצח/ת:** <@${winner.userId}> עם **${winner.votes}** קולות!\n\n${results.map((r,n)=>`**${n+1}.** <@${r.userId}> — ${r.votes} קולות — [צפייה](${r.url})`).join('\n')}`:'לא הוגשו עבודות.',color:'success'})]});
  }
};
