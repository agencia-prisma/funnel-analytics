'use client';

import { Button } from '@funnel/ui/button';
import { usePathname } from 'next/navigation';

import { switchWorkspaceAction } from '@/app/app/actions';

export function WorkspaceSwitcher({
  currentWorkspaceId,
  workspaces,
}: {
  currentWorkspaceId: string;
  workspaces: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname();

  return (
    <form action={switchWorkspaceAction} className="ml-auto flex gap-2">
      <input name="return_to" type="hidden" value={pathname} />
      <select
        aria-label="Workspace"
        className="h-10 rounded-lg border border-white/10 bg-[#111018] px-3 text-sm text-white"
        defaultValue={currentWorkspaceId}
        name="workspace_id"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary">
        Trocar
      </Button>
    </form>
  );
}
