import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/modules/community/store.js';
import { createSettingsOverview, createSettingsPage, createSettingsComponents } from '../src/services/settingsOverview.js';

test('settings overview includes every configurable server area within embed limits', () => {
  const json = createSettingsOverview(structuredClone(defaults)).toJSON();
  assert.equal(json.fields.length, 10);
  assert.ok(json.fields.every(field => field.name.length <= 256 && field.value.length <= 1024));
  for (const heading of ['קבלת פנים', 'אימות', 'פניות', 'לוגים', 'רמות', 'ערוצי פקודות', 'תפקידי גישה', 'מודולים', 'פאנלים ותחרויות', 'הגדרות פקודות']) {
    assert.ok(json.fields.some(field => field.name.includes(heading)));
  }
});

test('settings dashboard provides valid navigable pages and button rows', () => {
  const config = structuredClone(defaults);
  for (const page of ['overview', 'systems', 'access', 'commands', 'logging']) {
    assert.ok(createSettingsPage(config, page).toJSON().title);
    const rows = createSettingsComponents('123456789', page).map(row => row.toJSON());
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.components.length <= 5));
    assert.ok(rows.flatMap(row => row.components).every(button => button.custom_id.length <= 100));
  }
});
