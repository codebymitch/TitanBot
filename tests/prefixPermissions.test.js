import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

import banCommand from '../src/commands/Moderation/ban.js';
import pingCommand from '../src/commands/Core/ping.js';
import {
  getCommandDefaultPermissions,
  memberMeetsCommandPermissions,
  memberHasConfiguredModeratorRole,
} from '../src/utils/permissionGuard.js';
import { executePrefixCommand } from '../src/utils/messageAdapter.js';

const banData = banCommand.default?.data || banCommand.data || banCommand;
const pingData = pingCommand.default?.data || pingCommand.data || pingCommand;

function createMockMessage({ hasPermission = true, content = '!ban @user reason', modRoleId = null } = {}) {
  const sentMessages = [];

  const channel = {
    send: async (payload) => {
      sentMessages.push(payload);
      return {
        id: `msg-${sentMessages.length}`,
        edit: async (editPayload) => {
          sentMessages[sentMessages.length - 1] = editPayload;
          return sentMessages[sentMessages.length - 1];
        },
        deletable: true,
        delete: async () => {},
      };
    },
  };

  const required = getCommandDefaultPermissions(banData);
  const rolesCache = new Map();
  if (modRoleId) {
    rolesCache.set(modRoleId, { id: modRoleId });
  }

  const message = {
    id: 'trigger-msg',
    content,
    author: { id: 'user-1', tag: 'User#0001', bot: false, toString: () => '<@user-1>' },
    member: {
      id: 'user-1',
      permissions: {
        has: (perm) => {
          if (!hasPermission) return false;
          if (required == null) return true;
          return (BigInt(perm) & required) === required || perm === required;
        },
      },
      roles: {
        cache: {
          has: (roleId) => rolesCache.has(roleId),
        },
      },
    },
    guild: {
      id: 'guild-1',
      ownerId: 'owner-1',
      members: { cache: new Map(), fetch: async () => null },
    },
    channel,
    client: { config: { bot: { prefix: '!' } } },
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    deletable: false,
  };

  return { message, sentMessages };
}

function getEmbedDescription(payload) {
  const embed = payload.embeds?.[0];
  return embed?.data?.description ?? embed?.description ?? '';
}

test('getCommandDefaultPermissions reads BanMembers from ban command', () => {
  const permissions = getCommandDefaultPermissions(banData);
  assert.equal(permissions, PermissionFlagsBits.BanMembers);
});

test('getCommandDefaultPermissions returns null when command has no default permissions', () => {
  const permissions = getCommandDefaultPermissions(pingData);
  assert.equal(permissions, null);
});

test('memberMeetsCommandPermissions allows guild owner without explicit flags', () => {
  const member = {
    id: 'owner-1',
    guild: { ownerId: 'owner-1' },
    permissions: { has: () => false },
  };

  assert.equal(
    memberMeetsCommandPermissions(member, PermissionFlagsBits.BanMembers),
    true,
  );
});

test('executePrefixCommand blocks prefix ban when member lacks BanMembers', async () => {
  const { message, sentMessages } = createMockMessage({ hasPermission: false });
  let executeCalled = false;

  const command = {
    data: banData,
    execute: async () => {
      executeCalled = true;
    },
    category: 'moderation',
  };

  await executePrefixCommand(command, message, ['@user', 'reason'], message.client, '!');

  assert.equal(executeCalled, false);
  assert.equal(sentMessages.length, 1);
  assert.match(getEmbedDescription(sentMessages[0]), /do not have permission/i);
});

test('executePrefixCommand allows prefix ban when member has BanMembers', async () => {
  const { message, sentMessages } = createMockMessage({ hasPermission: true });
  let executeCalled = false;

  const command = {
    data: banData,
    execute: async () => {
      executeCalled = true;
    },
    category: 'moderation',
  };

  await executePrefixCommand(command, message, ['@user', 'reason'], message.client, '!');

  assert.equal(executeCalled, true);
  assert.equal(sentMessages.length, 0);
});

test('executePrefixCommand allows prefix ban when member has configured modRole without BanMembers', async () => {
  const modRoleId = 'mod-role-1';
  const { message, sentMessages } = createMockMessage({
    hasPermission: false,
    modRoleId,
  });
  let executeCalled = false;

  const command = {
    data: banData,
    category: 'moderation',
    execute: async () => {
      executeCalled = true;
    },
  };

  await executePrefixCommand(command, message, ['@user', 'reason'], message.client, '!', {
    modRole: modRoleId,
  });

  assert.equal(executeCalled, true);
  assert.equal(sentMessages.length, 0);
});

test('memberHasConfiguredModeratorRole detects modRole membership', () => {
  const member = {
    roles: {
      cache: {
        has: (id) => id === 'mod-role-1',
      },
    },
  };

  assert.equal(memberHasConfiguredModeratorRole(member, { modRole: 'mod-role-1' }), true);
  assert.equal(memberHasConfiguredModeratorRole(member, { modRole: 'other-role' }), false);
});

test('memberMeetsCommandPermissions accepts modRole for moderation commands', () => {
  const member = {
    id: 'user-1',
    guild: { ownerId: 'owner-1' },
    permissions: { has: () => false },
    roles: {
      cache: {
        has: (id) => id === 'mod-role-1',
      },
    },
  };

  assert.equal(
    memberMeetsCommandPermissions(member, PermissionFlagsBits.BanMembers, {
      guildConfig: { modRole: 'mod-role-1' },
      commandCategory: 'moderation',
    }),
    true,
  );
});
