import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicCommands = [
  'help', 'ping', 'botinfo', 'serverinfo', 'userinfo', 'avatar',
  'suggest', 'report', 'feedback', 'poll', 'selfpromo', 'lookingforeditor',
  'lookingforteam', 'editingtype', 'roles', 'contest', 'leaderboard', 'profile', 'rank'
];

const restrictedCommands = [
  'setup', 'reply', 'config', 'debug', 'reload', 'sync', 'botupdate',
  'setxp', 'resetxp', 'ban', 'kick', 'timeout', 'clear', 'warn',
  'settings', 'rolepanel', 'ticketpanel', 'testboost'
];

test('website lists every intended public command and no restricted command', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const listed = [...html.matchAll(/data-command="([^"]+)"/g)].map(match => match[1].split(' ')[0]);

  assert.deepEqual(listed.sort(), publicCommands.sort());
  for (const command of restrictedCommands) {
    assert.equal(listed.includes(command), false, `restricted /${command} must not appear`);
  }
  assert.match(html, /submit.*vote.*status/s);
  assert.doesNotMatch(html, /data-command="contest[^\"]*create|data-command="contest[^\"]*end/);
});
