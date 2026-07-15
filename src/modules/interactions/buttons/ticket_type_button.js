import ticketType from '../selectMenus/ticket_type.js';
export default{name:'ticket_type_button',async execute(i,client,args){i.values=[args[0]];return ticketType.execute(i,client,[args[1]||'default']);}};
