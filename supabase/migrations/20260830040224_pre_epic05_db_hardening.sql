-- Pre-EPIC 05 database hardening.
-- Add covering indexes for foreign keys used by auth/workspace/audit lookups.
-- These are additive only and do not change application behavior or RLS.

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs(actor_user_id);

create index if not exists workspace_invitations_accepted_by_idx
  on public.workspace_invitations(accepted_by);

create index if not exists workspace_invitations_invited_by_idx
  on public.workspace_invitations(invited_by);

create index if not exists workspaces_created_by_idx
  on public.workspaces(created_by);
