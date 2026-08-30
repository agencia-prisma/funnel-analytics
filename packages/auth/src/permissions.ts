export const WORKSPACE_ROLES = ['owner', 'admin', 'analyst', 'viewer'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PERMISSIONS = [
  'workspace.view',
  'workspace.update',
  'members.view',
  'members.invite',
  'members.update_role',
  'members.remove',
  'billing.view',
  'people.view',
  'people.view_pii',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionOverride = Partial<Record<Permission, boolean>>;

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set([
    'workspace.view',
    'workspace.update',
    'members.view',
    'members.invite',
    'members.update_role',
    'members.remove',
    'people.view',
  ]),
  analyst: new Set(['workspace.view', 'people.view']),
  viewer: new Set(['workspace.view']),
};

export function can(
  role: WorkspaceRole,
  permission: Permission,
  overrides: PermissionOverride = {},
): boolean {
  const override = overrides[permission];

  if (typeof override === 'boolean') {
    return override;
  }

  return ROLE_PERMISSIONS[role].has(permission);
}

export function canManageRole(
  actorRole: WorkspaceRole,
  currentTargetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): boolean {
  if (actorRole === 'owner') {
    return true;
  }

  if (actorRole !== 'admin') {
    return false;
  }

  return (
    (currentTargetRole === 'analyst' || currentTargetRole === 'viewer') &&
    (nextRole === 'analyst' || nextRole === 'viewer')
  );
}

export function canInviteRole(
  actorRole: WorkspaceRole,
  invitedRole: WorkspaceRole,
): boolean {
  if (invitedRole === 'owner') {
    return false;
  }

  if (actorRole === 'owner') {
    return true;
  }

  return (
    actorRole === 'admin' &&
    (invitedRole === 'analyst' || invitedRole === 'viewer')
  );
}

export function invitableRoles(actorRole: WorkspaceRole): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((role) => canInviteRole(actorRole, role));
}

export function canRemoveRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (actorRole === 'owner') {
    return true;
  }

  return (
    actorRole === 'admin' &&
    (targetRole === 'analyst' || targetRole === 'viewer')
  );
}
