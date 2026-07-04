import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbed } from '../src/utils/embeds.js';

test('createEmbed should ignore unimportant footer text and should not add a timestamp by default', () => {
  const embed = createEmbed({
    title: 'Test',
    description: 'Hello world',
    footer: 'Footer text should move into description'
  });

  const data = embed.toJSON();
  assert.equal(data.footer, undefined);
  assert.equal(data.timestamp, undefined);
  assert.equal(data.description, 'Hello world');
});

test('createEmbed should set important footer text on the embed footer', () => {
  const embed = createEmbed({
    title: 'Test',
    description: 'Hello world',
    footer: 'Dashboard closes after 10 minutes of inactivity'
  });

  const data = embed.toJSON();
  assert.equal(data.footer?.text, 'Dashboard closes after 10 minutes of inactivity');
  assert.equal(data.timestamp, undefined);
  assert.equal(data.description, 'Hello world');
});

test('setFooter should place important footer text on the embed footer', () => {
  const embed = createEmbed({
    title: 'Footer Test',
    description: 'Base description.'
  });

  embed.setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' });
  const data = embed.toJSON();

  assert.equal(data.footer?.text, 'Dashboard closes after 10 minutes of inactivity');
  assert.equal(data.description, 'Base description.');
});

test('setFooter should keep footer text at the bottom when fields are added after footer', () => {
  const embed = createEmbed({
    title: 'Dashboard',
    description: 'Manage settings for **Test Server**.',
  });

  embed.setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' });
  embed.addFields(
    { name: 'Status', value: '`Enabled`', inline: true },
    { name: 'Channel', value: '`Not set`', inline: true },
  );

  const data = embed.toJSON();
  assert.equal(data.footer?.text, 'Dashboard closes after 10 minutes of inactivity');
  assert.equal(data.description, 'Manage settings for **Test Server**.');
  assert.equal(data.fields?.length, 2);
});

test('setFooter should ignore unimportant footer text', () => {
  const embed = createEmbed({
    title: 'Footer Test',
    description: 'Base description.'
  });

  embed.setFooter({ text: 'Requested by mrpinkify' });
  const data = embed.toJSON();

  assert.equal(data.footer, undefined);
  assert.equal(data.description, 'Base description.');
});
