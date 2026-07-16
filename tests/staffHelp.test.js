import assert from 'node:assert/strict';
import test from 'node:test';
import staffHelp, { availableStaffCategories, STAFF_HELP_CATEGORIES } from '../src/commands/general/staffhelp.js';
import { AccessLevel } from '../src/modules/community/permissions.js';

test('/staffhelp is a guild-only command with valid category choices', () => {
  const data = staffHelp.data.toJSON();
  assert.equal(data.name, 'staffhelp');
  assert.equal(data.dm_permission, false);
  assert.match(data.description, /[\u0590-\u05ff]/);
  assert.deepEqual(data.options[0].choices.map(choice => choice.value), Object.keys(STAFF_HELP_CATEGORIES));
});

test('staff help categories follow the real access hierarchy', () => {
  assert.deepEqual(availableStaffCategories(AccessLevel.EVERYONE), []);
  assert.deepEqual(availableStaffCategories(AccessLevel.HELPER).map(([key]) => key), ['tickets']);
  assert.deepEqual(availableStaffCategories(AccessLevel.MODERATOR).map(([key]) => key), ['tickets', 'moderation']);
  assert.deepEqual(availableStaffCategories(AccessLevel.ADMIN).map(([key]) => key), ['tickets', 'moderation', 'admin']);
  assert.deepEqual(availableStaffCategories(AccessLevel.OWNER).map(([key]) => key), ['tickets', 'moderation', 'admin', 'owner']);
});

test('owner-only maintenance commands never leak into lower categories', () => {
  const lowerText = availableStaffCategories(AccessLevel.ADMIN).flatMap(([, category]) => category.commands).flat().join(' ');
  for (const command of ['/setup', '/config', '/botupdate', '/reply', '/reload', '/sync', '/debug']) {
    assert.equal(lowerText.includes(command), false, `${command} must remain owner-only`);
  }
});
