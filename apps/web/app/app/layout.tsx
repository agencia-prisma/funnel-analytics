import { can } from '@funnel/auth';
import { Button } from '@funnel/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/(auth)/actions';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { requireUser } from '@/lib/auth/session';
import {
  getCurrentWorkspace,
  hasWorkspacePermission,
  listUserWorkspaces,
} from '@/lib/workspaces';


export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const workspaces = await listUserWorkspaces();

  if (!workspaces.length) {
    redirect('/onboarding');
  }

  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect('/onboarding');
  }

  const canViewPixels = await hasWorkspacePermission(
    workspace.id,
    'pixels.view',
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-4">
          <Link className="font-semibold text-white" href="/app">
            Funnel Analytics
          </Link>
          <WorkspaceSwitcher
            currentWorkspaceId={workspace.id}
            workspaces={workspaces.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
          />
          <nav className="flex items-center gap-4 text-sm text-zinc-300">
            {canViewPixels ? <Link href="/app/pixels">Pixels</Link> : null}
            {can(workspace.role, 'workspace.view') ? (
              <Link href="/app/settings/workspace">Configurações</Link>
            ) : null}
            {can(workspace.role, 'members.view') ? (
              <Link href="/app/settings/members">Membros</Link>
            ) : null}
          </nav>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              Sair
            </Button>
          </form>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-3 text-xs text-zinc-500">
          {user.email} · {workspace.role}
        </div>
      </header>
      {children}
    </div>
  );
}
