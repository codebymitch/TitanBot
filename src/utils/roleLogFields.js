const MAX_DISPLAYED_ROLE_PERMISSIONS = 5;

export function buildRoleAuditFields(role, { includeMemberCount = false } = {}) {
  const fields = [
    {
      name: '🏷️ Role Name',
      value: role.name,
      inline: true
    },
    {
      name: '🎨 Color',
      value: role.hexColor || '#000000',
      inline: true
    },
    {
      name: '🆔 Role ID',
      value: role.id,
      inline: true
    }
  ];

  const permissions = role.permissions.toArray();
  if (permissions.length > 0) {
    const displayPerms = permissions.slice(0, MAX_DISPLAYED_ROLE_PERMISSIONS).join(', ');
    fields.push({
      name: '🔐 Permissions',
      value: permissions.length > MAX_DISPLAYED_ROLE_PERMISSIONS
        ? `${displayPerms}... (+${permissions.length - MAX_DISPLAYED_ROLE_PERMISSIONS} more)`
        : displayPerms,
      inline: false
    });
  }

  fields.push(
    {
      name: '✅ Hoisted',
      value: role.hoist ? 'Yes' : 'No',
      inline: true
    },
    {
      name: '🤖 Managed',
      value: role.managed ? 'Yes (Bot role)' : 'No',
      inline: true
    },
    {
      name: '📍 Position',
      value: role.position.toString(),
      inline: true
    }
  );

  if (includeMemberCount) {
    fields.push({
      name: '👥 Members with Role',
      value: role.members.size.toString(),
      inline: true
    });
  }

  return fields;
}
