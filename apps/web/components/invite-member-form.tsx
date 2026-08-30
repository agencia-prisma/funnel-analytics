'use client';

import type { WorkspaceRole } from '@funnel/auth';
import { Button } from '@funnel/ui/button';
import { useActionState } from 'react';

import {
  createInvitationAction,
  type InvitationActionState,
} from '@/app/app/settings/members/actions';
import { inputClassName } from '@/components/auth-card';

const initialState: InvitationActionState = {};

export function InviteMemberForm({
  workspaceId,
  allowedRoles,
}: {
  workspaceId: string;
  allowedRoles: WorkspaceRole[];
}) {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    initialState,
  );

  return (
    <form action={action} className="grid gap-4">
      <input name="workspace_id" type="hidden" value={workspaceId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <label className="text-sm font-medium text-zinc-200">
          E-mail
          <input
            className={inputClassName}
            name="email"
            placeholder="pessoa@empresa.com"
            required
            type="email"
          />
        </label>
        <label className="text-sm font-medium text-zinc-200">
          Role
          <select className={inputClassName} name="role" required>
            {allowedRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={pending} type="submit">
          {pending ? 'Criando…' : 'Convidar'}
        </Button>
      </div>
      {state.error ? (
        <p className="text-sm text-red-300">{state.error}</p>
      ) : null}
      {state.link ? (
        <div className="rounded-lg border border-violet-400/20 bg-violet-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-200">
            Link seguro do convite
          </p>
          <input
            className={inputClassName}
            data-testid="invitation-link"
            readOnly
            value={state.link}
          />
          <p className="mt-2 text-xs text-zinc-500">
            O token é exibido uma única vez e não é salvo em texto aberto.
          </p>
        </div>
      ) : null}
    </form>
  );
}
