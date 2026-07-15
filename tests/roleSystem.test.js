import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import role from '../src/commands/roles/role.js';
import roles from '../src/commands/roles/roles.js';
import rolepanel from '../src/commands/admin/rolepanel.js';
import settings from '../src/commands/admin/settings.js';
import { panelPayload, roleTemplates, validateRoleAction } from '../src/services/roleSystemService.js';
import buttonHandlers from '../src/modules/interactions/buttons/role_system.js';
import selectHandlers from '../src/modules/interactions/selectMenus/role_system.js';

test('role commands expose the complete slash-command surface without duplicates', () => {
  assert.equal(roles.data.name, 'roles');
  assert.deepEqual(role.data.toJSON().options.map(option=>option.name), ['add','remove','info','create','delete']);
  assert.deepEqual(rolepanel.data.toJSON().options.map(option=>option.name), ['create','edit','delete','list','refresh']);
  assert.equal(new Set(['roles',role.data.name,rolepanel.data.name]).size,3);
});

test('role templates never contain Administrator, ban or kick permissions', () => {
  for (const permissions of Object.values(roleTemplates)) {
    const bits=new PermissionsBitField(permissions);
    assert.equal(bits.has(PermissionFlagsBits.Administrator),false);
    assert.equal(bits.has(PermissionFlagsBits.BanMembers),false);
    assert.equal(bits.has(PermissionFlagsBits.KickMembers),false);
  }
});

test('hierarchy validator rejects managed, administrator and above-bot roles', async () => {
  const guild={id:'g',ownerId:'owner',client:null,members:{me:{permissions:new PermissionsBitField(PermissionFlagsBits.ManageRoles),roles:{highest:{position:10}}}}};
  const actor={id:'staff',roles:{highest:{position:9}}};
  const make=(overrides={})=>({id:'r',position:1,managed:false,tags:{},permissions:new PermissionsBitField(),...overrides});
  assert.match(await validateRoleAction(guild,actor,make({managed:true})),/Discord/);
  assert.match(await validateRoleAction(guild,actor,make({position:10})),/הבוט/);
  assert.match(await validateRoleAction(guild,actor,make({permissions:new PermissionsBitField(PermissionFlagsBits.Administrator)})),/Administrator/);
});

test('panel rendering builds persistent controls for buttons and select menus', () => {
  const roleCache=new Collection([['1',{id:'1',name:'Premiere'}],['2',{id:'2',name:'After Effects'}]]);
  const guild={roles:{cache:roleCache}};const base={id:'7',title:'תוכנות',description:'בחרו',category:'software',maxSelections:2,roleIds:['1','2']};
  const buttons=panelPayload({...base,selectionType:'buttons'},guild);
  const menu=panelPayload({...base,selectionType:'select_menu'},guild);
  assert.equal(buttons.components[0].components[0].data.custom_id,'role_panel_button:7:1');
  assert.equal(menu.components[0].components[0].data.custom_id,'role_panel_select:7');
});

test('settings and persistent interaction handlers are registered structurally', () => {
  const group=settings.data.toJSON().options.find(option=>option.name==='roles');
  assert.deepEqual(group.options.map(option=>option.name),['view','set','category','permissions']);
  assert.deepEqual(buttonHandlers.map(handler=>handler.name),['role_panel_button','role_panel_delete','role_confirm','role_cancel']);
  assert.deepEqual(selectHandlers.map(handler=>handler.name),['self_roles','role_panel_select']);
});
