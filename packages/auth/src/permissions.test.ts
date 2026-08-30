import { describe, expect, it } from 'vitest';

import {
  can,
  canInviteRole,
  canManageRole,
  canRemoveRole,
  invitableRoles,
  type Permission,
} from './permissions';

describe('workspace permissions', () => {
  it('maps roles to the expected default permissions', () => {
    const cases: Array<[string, Permission, boolean]> = [
      ['owner', 'people.view_pii', true],
      ['admin', 'members.invite', true],
      ['admin', 'people.view_pii', false],
      ['analyst', 'people.view', true],
      ['analyst', 'members.invite', false],
      ['viewer', 'workspace.view', true],
      ['viewer', 'workspace.update', false],
    ];

    for (const [role, permission, expected] of cases) {
      expect(can(role as 'owner', permission)).toBe(expected);
    }
  });

  it('applies explicit permission overrides after role defaults', () => {
    expect(can('viewer', 'people.view', { 'people.view': true })).toBe(true);
    expect(can('owner', 'people.view_pii', { 'people.view_pii': false })).toBe(
      false,
    );
  });

  it('prevents admins from creating or managing owners/admins', () => {
    expect(canInviteRole('admin', 'owner')).toBe(false);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'analyst')).toBe(true);
    expect(canManageRole('admin', 'viewer', 'analyst')).toBe(true);
    expect(canManageRole('admin', 'admin', 'viewer')).toBe(false);
    expect(canManageRole('admin', 'viewer', 'owner')).toBe(false);
    expect(invitableRoles('admin')).toEqual(['analyst', 'viewer']);
    expect(canRemoveRole('admin', 'admin')).toBe(false);
    expect(canRemoveRole('admin', 'viewer')).toBe(true);
  });
});
