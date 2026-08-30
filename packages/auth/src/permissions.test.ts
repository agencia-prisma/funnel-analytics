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
    const cases: Array<
      ['owner' | 'admin' | 'analyst' | 'viewer', Permission, boolean]
    > = [
      ['owner', 'people.view_pii', true],
      ['owner', 'pixels.delete', true],
      ['admin', 'members.invite', true],
      ['admin', 'people.view_pii', false],
      ['admin', 'domains.manage', true],
      ['analyst', 'people.view', true],
      ['analyst', 'pixels.view', true],
      ['analyst', 'pixels.update', false],
      ['viewer', 'workspace.view', true],
      ['viewer', 'domains.view', true],
      ['viewer', 'pixels.create', false],
    ];

    for (const [role, permission, expected] of cases) {
      expect(can(role, permission)).toBe(expected);
    }
  });

  it('applies explicit permission overrides after role defaults', () => {
    expect(can('viewer', 'pixels.create', { 'pixels.create': true })).toBe(
      true,
    );
    expect(can('owner', 'pixels.update', { 'pixels.update': false })).toBe(
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
