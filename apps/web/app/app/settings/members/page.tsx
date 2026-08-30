import {
  can,
  canManageRole,
  canRemoveRole,
  invitableRoles,
  type WorkspaceRole,
  WORKSPACE_ROLES,
} from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { Button } from '@funnel/ui/button';
import { Card } from '@funnel/ui/card';

import { FormMessage } from '@/components/auth-card';
import { InviteMemberForm } from '@/components/invite-member-form';
import { requireCurrentWorkspace } from '@/lib/workspaces';

import {
  changeMemberRoleAction,
  removeMemberAction,
  revokeInvitationAction,
} from './actions';

interface MemberRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: WorkspaceRole;
  status: string;
  created_at: string;
}

interface InvitationRow {
  invitation_id: string;
  email_normalized: string;
  role: WorkspaceRole;
  status: string;
  expires_at: string;
  created_at: string;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: membersData, error: memberError } = await supabase.rpc(
    'list_workspace_members',
    { target_workspace_id: workspace.id },
  );

  if (memberError) {
    throw memberError;
  }

  const members = (membersData ?? []) as MemberRow[];
  const canInvite = can(workspace.role, 'members.invite');
  const canRemove = can(workspace.role, 'members.remove');
  const canUpdateRole = can(workspace.role, 'members.update_role');

  let invitations: InvitationRow[] = [];

  if (canInvite) {
    const { data, error } = await supabase.rpc('list_workspace_invitations', {
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    invitations = (data ?? []) as InvitationRow[];
  }

  const inviteRoles = invitableRoles(workspace.role);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
        Configurações
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Membros</h1>
      <div className="mt-6">
        <FormMessage error={params.error} message={params.message} />
      </div>

      {canInvite ? (
        <Card className="mt-8">
          <h2 className="text-lg font-semibold text-white">Convidar membro</h2>
          <div className="mt-5">
            <InviteMemberForm
              allowedRoles={inviteRoles}
              workspaceId={workspace.id}
            />
          </div>
        </Card>
      ) : null}

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="pb-4">Nome</th>
              <th className="pb-4">E-mail</th>
              <th className="pb-4">Role</th>
              <th className="pb-4">Status</th>
              <th className="pb-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const manageableRoles = WORKSPACE_ROLES.filter((role) =>
                canManageRole(workspace.role, member.role, role),
              );

              return (
                <tr
                  className="border-t border-white/10 text-zinc-300"
                  key={member.user_id}
                >
                  <td className="py-4">{member.display_name ?? 'Sem nome'}</td>
                  <td className="py-4">{member.email ?? 'Protegido'}</td>
                  <td className="py-4">{member.role}</td>
                  <td className="py-4">{member.status}</td>
                  <td className="py-4">
                    <div className="flex justify-end gap-2">
                      {canUpdateRole && manageableRoles.length ? (
                        <form
                          action={changeMemberRoleAction}
                          className="flex gap-2"
                        >
                          <input
                            name="workspace_id"
                            type="hidden"
                            value={workspace.id}
                          />
                          <input
                            name="user_id"
                            type="hidden"
                            value={member.user_id}
                          />
                          <select
                            className="h-9 rounded-lg border border-white/10 bg-[#111018] px-2 text-xs"
                            defaultValue={member.role}
                            name="role"
                          >
                            {manageableRoles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="secondary">
                            Salvar
                          </Button>
                        </form>
                      ) : null}
                      {canRemove &&
                      canRemoveRole(workspace.role, member.role) ? (
                        <form action={removeMemberAction}>
                          <input
                            name="workspace_id"
                            type="hidden"
                            value={workspace.id}
                          />
                          <input
                            name="user_id"
                            type="hidden"
                            value={member.user_id}
                          />
                          <Button type="submit" variant="secondary">
                            Remover
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {canInvite ? (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold text-white">Convites</h2>
          <div className="mt-4 grid gap-3">
            {invitations.length ? (
              invitations.map((invitation) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 p-4 text-sm"
                  key={invitation.invitation_id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-zinc-200">
                      {invitation.email_normalized}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {invitation.role} · {invitation.status}
                    </p>
                  </div>
                  {invitation.status === 'pending' ? (
                    <form action={revokeInvitationAction}>
                      <input
                        name="invitation_id"
                        type="hidden"
                        value={invitation.invitation_id}
                      />
                      <Button type="submit" variant="secondary">
                        Revogar
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">Nenhum convite criado.</p>
            )}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
