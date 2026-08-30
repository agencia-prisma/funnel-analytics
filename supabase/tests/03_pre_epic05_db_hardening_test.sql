begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and indexname = 'audit_logs_actor_user_id_idx'
  ),
  'audit_logs.actor_user_id has a covering index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'workspace_invitations'
      and indexname = 'workspace_invitations_accepted_by_idx'
  ),
  'workspace_invitations.accepted_by has a covering index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'workspace_invitations'
      and indexname = 'workspace_invitations_invited_by_idx'
  ),
  'workspace_invitations.invited_by has a covering index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'workspaces'
      and indexname = 'workspaces_created_by_idx'
  ),
  'workspaces.created_by has a covering index'
);

select * from finish();
rollback;
