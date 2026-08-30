import 'server-only';

import type { Permission, WorkspaceRole } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUser } from './auth/session';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  status: string;
  role: WorkspaceRole;
}

export async function listUserWorkspaces(): Promise<WorkspaceSummary[]> {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (membershipError) {
    throw membershipError;
  }

  if (!memberships?.length) {
    return [];
  }

  const roleByWorkspace = new Map(
    memberships.map((membership) => [
      membership.workspace_id,
      membership.role as WorkspaceRole,
    ]),
  );

  const { data: workspaces, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, name, slug, timezone, currency, status')
    .in(
      'id',
      memberships.map((membership) => membership.workspace_id),
    )
    .eq('status', 'active');

  if (workspaceError) {
    throw workspaceError;
  }

  return (workspaces ?? []).map((workspace) => ({
    ...workspace,
    role: roleByWorkspace.get(workspace.id) ?? 'viewer',
  }));
}

export async function getCurrentWorkspace() {
  const workspaces = await listUserWorkspaces();

  if (!workspaces.length) {
    return null;
  }

  const cookieStore = await cookies();
  const selectedId = cookieStore.get('funnel_workspace_id')?.value;

  return (
    workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0]
  );
}

export async function requireCurrentWorkspace() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect('/onboarding');
  }

  return workspace;
}

export async function hasWorkspacePermission(
  workspaceId: string,
  permission: Permission,
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('has_workspace_permission', {
    target_workspace_id: workspaceId,
    target_permission: permission,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function requireWorkspacePermission(
  workspaceId: string,
  permission: Permission,
) {
  if (!(await hasWorkspacePermission(workspaceId, permission))) {
    throw new Error('INSUFFICIENT_PERMISSION');
  }
}
