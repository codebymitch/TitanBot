import { MessageFlags } from 'discord.js';
import { getConfig } from '../../community/store.js';
import { ticketPanelPayload } from '../../../services/ticketSystemService.js';
export default{name:'ticket_open',async execute(i,client){const config=await getConfig(client,i.guildId);if(!config.tickets.enabled)return i.reply({content:'מערכת הכרטיסים עדיין לא הוגדרה.',flags:MessageFlags.Ephemeral});return i.reply({...ticketPanelPayload(config),flags:MessageFlags.Ephemeral});}};
