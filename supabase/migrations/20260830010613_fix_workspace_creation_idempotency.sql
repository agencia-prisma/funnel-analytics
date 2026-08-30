-- Prevent repeated onboarding requests from creating duplicate Workspaces.
-- Keeps the existing create_workspace public API, but makes its initial creation
-- idempotent for users who already have an active Workspace membership.

create or replace function private.create_workspace_impl(
  workspace_name text,
  workspace_slug text,
  workspace_timezone text,
  workspace_currency char(3)
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  existing_workspace_id uuid;
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  -- Serialize creation for the same user so stale tabs, retries and
  -- concurrent form submissions cannot create duplicate Workspaces.
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  select wm.workspace_id
  into existing_workspace_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = actor_id
    and wm.status = 'active'
    and w.status = 'active'
  order by wm.created_at asc
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  if nullif(btrim(workspace_name), '') is null
    or nullif(btrim(workspace_slug), '') is null
    or nullif(btrim(workspace_timezone), '') is null
    or workspace_currency !~ '^[A-Z]{3}$'
  then
    raise exception 'WORKSPACE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.workspaces (
    name,
    slug,
    timezone,
    currency,
    created_by
  )
  values (
    btrim(workspace_name),
    workspace_slug,
    btrim(workspace_timezone),
    workspace_currency,
    actor_id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status
  )
  values (
    new_workspace_id,
    actor_id,
    'owner',
    'active'
  );

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  )
  values (
    new_workspace_id,
    actor_id,
    'workspace.created',
    'workspace',
    new_workspace_id::text
  );

  return new_workspace_id;
end;
$$;

revoke all on function private.create_workspace_impl(text, text, text, char(3))
from public, anon, authenticated;

grant execute on function private.create_workspace_impl(text, text, text, char(3))
to authenticated;
