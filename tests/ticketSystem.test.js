import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionFlagsBits } from 'discord.js';
import { ticketCommand } from '../src/commands/tickets/factory.js';
import ticket from '../src/commands/admin/ticket.js';
import ticketpanel from '../src/commands/admin/ticketpanel.js';
import settings from '../src/commands/admin/settings.js';
import ticketType from '../src/modules/interactions/selectMenus/ticket_type.js';
import ticketButtons from '../src/modules/interactions/buttons/ticket_actions.js';
import { normalizeTicket, safeChannelName, ticketMessagePayload, ticketPanelPayload, TICKET_TYPES } from '../src/services/ticketSystemService.js';

test('all ticket commands and subcommands build without duplicate names',()=>{const standalone=['add','remove','close','transcript','claim','unclaim','rename','ticketinfo','ticketstatus','ticketpriority'].map(name=>ticketCommand(name).data.toJSON());assert.equal(new Set(standalone.map(v=>v.name)).size,10);assert.deepEqual(ticket.data.toJSON().options.map(v=>v.name),['open','setup','disable']);assert.deepEqual(ticketpanel.data.toJSON().options.map(v=>v.name),['create','edit','delete']);});
test('legacy ticket records are preserved and safely normalized',()=>{const legacy={ownerId:'u',supportRoleId:'s',subject:'Legacy issue',createdAt:100};const value=normalizeTicket(legacy,{id:'42',guildId:'g',channelId:'c'});assert.equal(value.creatorId,'u');assert.equal(value.description,'Legacy issue');assert.equal(value.id,'42');assert.equal(value.status,'open');assert.deepEqual(value.addedMemberIds,[]);assert.equal(value.supportRoleId,'s');});
test('ticket panels expose every enabled ticket type through persistent select controls',()=>{const config={tickets:{enabledTypes:Object.keys(TICKET_TYPES)}};const payload=ticketPanelPayload(config);const menu=payload.components[0].toJSON().components[0];assert.equal(menu.options.length,8);assert.equal(menu.custom_id,'ticket_type:default');});
test('contextual ticket modals ask only relevant fields and respect Discord five-field limit',async()=>{const client={db:{get:async()=>({tickets:{enabledTypes:Object.keys(TICKET_TYPES)}})}};for(const type of Object.keys(TICKET_TYPES)){let modal;const interaction={guildId:'g',values:[type],showModal:async value=>{modal=value.toJSON();}};await ticketType.execute(interaction,client,['default']);assert.ok(modal.components.length>=2&&modal.components.length<=5);const ids=modal.components.map(row=>row.components[0].custom_id);assert.ok(ids.includes('title')&&ids.includes('description'));if(type==='editing')assert.ok(ids.includes('software'));if(type==='paid_work')assert.ok(ids.includes('budget'));}});
test('ticket channel names are sanitized and retain the ticket id',()=>{assert.equal(safeChannelName('Itay שלום !!!','42'),'itay-0042');assert.match(safeChannelName('','7','report'),/^report-0007$/);assert.ok(safeChannelName('a'.repeat(200),'99').length<=100);});
test('ticket opening message contains persistent management controls',()=>{const payload=ticketMessagePayload(normalizeTicket({id:'1',guildId:'g',channelId:'c',creatorId:'u',title:'Title',description:'Details'}));assert.equal(payload.components.length,2);assert.equal(payload.components.flatMap(row=>row.components).length,7);assert.equal(ticketButtons.length,4);});
test('settings exposes all required ticket configuration areas',()=>{const group=settings.data.toJSON().options.find(option=>option.name==='tickets');assert.deepEqual(group.options.map(option=>option.name),['view','channel','role','limits','types','toggles']);});
