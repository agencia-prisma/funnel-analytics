-- EPIC 09 — Funnel Definition + Rule Engine Foundation
-- Versioned funnel control plane. Runtime evaluation remains deterministic in @funnel/rule-engine.

create type public.funnel_status as enum ('draft', 'active', 'archived');

create or replace function private.role_has_permission(
  target_role public.workspace_role,
  target_permission text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case target_role
    when 'owner' then target_permission = any (array[
      'workspace.view',
      'workspace.update',
      'members.view',
      'members.invite',
      'members.update_role',
      'members.remove',
      'billing.view',
      'people.view',
      'people.view_pii',
      'pixels.view',
      'pixels.create',
      'pixels.update',
      'pixels.delete',
      'domains.view',
      'domains.manage',
      'funnels.view',
      'funnels.manage'
    ])
    when 'admin' then target_permission = any (array[
      'workspace.view',
      'workspace.update',
      'members.view',
      'members.invite',
      'members.update_role',
      'members.remove',
      'people.view',
      'pixels.view',
      'pixels.create',
      'pixels.update',
      'pixels.delete',
      'domains.view',
      'domains.manage',
      'funnels.view',
      'funnels.manage'
    ])
    when 'analyst' then target_permission = any (array[
      'workspace.view',
      'people.view',
      'pixels.view',
      'domains.view',
      'funnels.view'
    ])
    when 'viewer' then target_permission = any (array[
      'workspace.view',
      'pixels.view',
      'domains.view',
      'funnels.view'
    ])
    else false
  end;
$$;

create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null
    check (char_length(btrim(name)) between 1 and 120),
  description text
    check (description is null or char_length(description) <= 2000),
  status public.funnel_status not null default 'draft',
  current_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint funnels_workspace_id_id_unique unique (workspace_id, id),
  constraint funnels_status_consistency check (
    (status = 'draft' and archived_at is null)
    or
    (status = 'active' and current_version_id is not null and archived_at is null)
    or
    (status = 'archived' and current_version_id is not null and archived_at is not null)
  )
);

create table public.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  funnel_id uuid not null,
  version integer not null check (version >= 1),
  definition_version smallint not null default 1
    check (definition_version = 1),
  mode text not null default 'ordered'
    check (mode = 'ordered'),
  conversion_window_seconds integer not null
    check (conversion_window_seconds between 60 and 7776000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint funnel_versions_funnel_workspace_fkey
    foreign key (workspace_id, funnel_id)
    references public.funnels(workspace_id, id)
    on delete cascade,
  constraint funnel_versions_funnel_version_unique
    unique (funnel_id, version),
  constraint funnel_versions_workspace_funnel_id_unique
    unique (workspace_id, funnel_id, id)
);

create table public.funnel_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  funnel_id uuid not null,
  funnel_version_id uuid not null,
  step_key text not null
    check (
      char_length(step_key) between 1 and 64
      and step_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    ),
  position smallint not null check (position between 1 and 20),
  name text not null
    check (char_length(btrim(name)) between 1 and 120),
  rule jsonb not null
    check (
      jsonb_typeof(rule) = 'object'
      and octet_length(rule::text) <= 16384
    ),
  created_at timestamptz not null default now(),
  constraint funnel_steps_version_workspace_fkey
    foreign key (workspace_id, funnel_id, funnel_version_id)
    references public.funnel_versions(workspace_id, funnel_id, id)
    on delete cascade,
  constraint funnel_steps_version_position_unique
    unique (funnel_version_id, position),
  constraint funnel_steps_version_key_unique
    unique (funnel_version_id, step_key)
);

alter table public.funnels
  add constraint funnels_current_version_fkey
  foreign key (workspace_id, id, current_version_id)
  references public.funnel_versions(workspace_id, funnel_id, id)
  on delete restrict;

create index funnels_workspace_status_idx
  on public.funnels(workspace_id, status);
create index funnels_workspace_updated_idx
  on public.funnels(workspace_id, updated_at desc);
create index funnel_versions_workspace_funnel_idx
  on public.funnel_versions(workspace_id, funnel_id, version desc);
create index funnel_steps_workspace_funnel_idx
  on public.funnel_steps(workspace_id, funnel_id, funnel_version_id, position);

create trigger funnels_set_updated_at
before update on public.funnels
for each row execute function private.set_updated_at();

create function private.prevent_funnel_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FUNNEL_VERSION_IMMUTABLE' using errcode = 'P0001';
end;
$$;

create function private.prevent_funnel_step_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FUNNEL_STEP_IMMUTABLE' using errcode = 'P0001';
end;
$$;

create trigger funnel_versions_immutable_update
before update on public.funnel_versions
for each row execute function private.prevent_funnel_version_mutation();

create trigger funnel_steps_immutable_update
before update on public.funnel_steps
for each row execute function private.prevent_funnel_step_mutation();

alter table public.funnels enable row level security;
alter table public.funnel_versions enable row level security;
alter table public.funnel_steps enable row level security;

create policy funnels_select_view
on public.funnels
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'funnels.view'
  )
);

create policy funnel_versions_select_view
on public.funnel_versions
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'funnels.view'
  )
);

create policy funnel_steps_select_view
on public.funnel_steps
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'funnels.view'
  )
);

revoke all on public.funnels from public, anon, authenticated;
revoke all on public.funnel_versions from public, anon, authenticated;
revoke all on public.funnel_steps from public, anon, authenticated;

grant select on public.funnels to authenticated;
grant select on public.funnel_versions to authenticated;
grant select on public.funnel_steps to authenticated;

grant all on public.funnels to service_role;
grant all on public.funnel_versions to service_role;
grant all on public.funnel_steps to service_role;

create function private.validate_funnel_steps_v1(target_steps jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_steps is null
    or jsonb_typeof(target_steps) <> 'array'
    or jsonb_array_length(target_steps) < 2
    or jsonb_array_length(target_steps) > 20
    or octet_length(target_steps::text) > 131072
  then
    raise exception 'FUNNEL_STEPS_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_steps) as item(step)
    where jsonb_typeof(step) <> 'object'
      or coalesce(step ->> 'step_key', '') !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      or char_length(coalesce(step ->> 'step_key', '')) > 64
      or char_length(btrim(coalesce(step ->> 'name', ''))) not between 1 and 120
      or jsonb_typeof(step -> 'rule') <> 'object'
      or coalesce(step -> 'rule' ->> 'kind', '') not in ('condition', 'group', 'not')
      or octet_length(coalesce((step -> 'rule')::text, '')) > 16384
  ) then
    raise exception 'FUNNEL_STEPS_INVALID' using errcode = 'P0001';
  end if;

  if (
    select count(*) <> count(distinct step ->> 'step_key')
    from jsonb_array_elements(target_steps) as item(step)
  ) then
    raise exception 'FUNNEL_STEP_KEY_DUPLICATE' using errcode = 'P0001';
  end if;
end;
$$;

create function private.create_funnel_v1_impl(
  target_workspace_id uuid,
  funnel_name text,
  funnel_description text,
  conversion_window_seconds integer,
  steps jsonb
)
returns table (
  funnel_id uuid,
  funnel_version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_funnel_id uuid;
  new_version_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if target_workspace_id is null
    or char_length(btrim(coalesce(funnel_name, ''))) not between 1 and 120
    or (funnel_description is not null and char_length(funnel_description) > 2000)
    or conversion_window_seconds not between 60 and 7776000
  then
    raise exception 'FUNNEL_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.status = 'active'
  ) then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'funnels.manage'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  perform private.validate_funnel_steps_v1(steps);

  insert into public.funnels (
    workspace_id,
    name,
    description,
    status,
    created_by,
    updated_by
  )
  values (
    target_workspace_id,
    btrim(funnel_name),
    funnel_description,
    'draft',
    actor_id,
    actor_id
  )
  returning id into new_funnel_id;

  insert into public.funnel_versions (
    workspace_id,
    funnel_id,
    version,
    definition_version,
    mode,
    conversion_window_seconds,
    created_by
  )
  values (
    target_workspace_id,
    new_funnel_id,
    1,
    1,
    'ordered',
    conversion_window_seconds,
    actor_id
  )
  returning id into new_version_id;

  insert into public.funnel_steps (
    workspace_id,
    funnel_id,
    funnel_version_id,
    step_key,
    position,
    name,
    rule
  )
  select
    target_workspace_id,
    new_funnel_id,
    new_version_id,
    step ->> 'step_key',
    ordinal::smallint,
    btrim(step ->> 'name'),
    step -> 'rule'
  from jsonb_array_elements(steps) with ordinality as item(step, ordinal);

  update public.funnels
  set
    status = 'active',
    current_version_id = new_version_id,
    updated_by = actor_id
  where id = new_funnel_id
    and workspace_id = target_workspace_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_id,
    'funnel.created',
    'funnel',
    new_funnel_id::text,
    jsonb_build_object('version', 1, 'step_count', jsonb_array_length(steps))
  );

  return query
  select new_funnel_id, new_version_id, 1;
end;
$$;

create function public.create_funnel_v1(
  target_workspace_id uuid,
  funnel_name text,
  funnel_description text,
  conversion_window_seconds integer,
  steps jsonb
)
returns table (
  funnel_id uuid,
  funnel_version_id uuid,
  version integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_funnel_v1_impl(
    target_workspace_id,
    funnel_name,
    funnel_description,
    conversion_window_seconds,
    steps
  );
$$;

create function private.create_funnel_version_v1_impl(
  target_workspace_id uuid,
  target_funnel_id uuid,
  expected_current_version integer,
  conversion_window_seconds integer,
  steps jsonb
)
returns table (
  funnel_version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_status public.funnel_status;
  current_version integer;
  next_version integer;
  new_version_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if target_workspace_id is null
    or target_funnel_id is null
    or expected_current_version is null
    or expected_current_version < 1
    or conversion_window_seconds not between 60 and 7776000
  then
    raise exception 'FUNNEL_INVALID' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'funnels.manage'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  perform private.validate_funnel_steps_v1(steps);

  select f.status, fv.version
  into current_status, current_version
  from public.funnels f
  join public.funnel_versions fv
    on fv.id = f.current_version_id
    and fv.workspace_id = f.workspace_id
    and fv.funnel_id = f.id
  where f.id = target_funnel_id
    and f.workspace_id = target_workspace_id
  for update of f;

  if not found then
    raise exception 'FUNNEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if current_status = 'archived' then
    raise exception 'FUNNEL_ARCHIVED' using errcode = 'P0001';
  end if;

  if current_version <> expected_current_version then
    raise exception 'FUNNEL_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  next_version := current_version + 1;

  insert into public.funnel_versions (
    workspace_id,
    funnel_id,
    version,
    definition_version,
    mode,
    conversion_window_seconds,
    created_by
  )
  values (
    target_workspace_id,
    target_funnel_id,
    next_version,
    1,
    'ordered',
    conversion_window_seconds,
    actor_id
  )
  returning id into new_version_id;

  insert into public.funnel_steps (
    workspace_id,
    funnel_id,
    funnel_version_id,
    step_key,
    position,
    name,
    rule
  )
  select
    target_workspace_id,
    target_funnel_id,
    new_version_id,
    step ->> 'step_key',
    ordinal::smallint,
    btrim(step ->> 'name'),
    step -> 'rule'
  from jsonb_array_elements(steps) with ordinality as item(step, ordinal);

  update public.funnels
  set
    status = 'active',
    current_version_id = new_version_id,
    updated_by = actor_id
  where id = target_funnel_id
    and workspace_id = target_workspace_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_id,
    'funnel.version_created',
    'funnel',
    target_funnel_id::text,
    jsonb_build_object(
      'version', next_version,
      'previous_version', current_version,
      'step_count', jsonb_array_length(steps)
    )
  );

  return query
  select new_version_id, next_version;
end;
$$;

create function public.create_funnel_version_v1(
  target_workspace_id uuid,
  target_funnel_id uuid,
  expected_current_version integer,
  conversion_window_seconds integer,
  steps jsonb
)
returns table (
  funnel_version_id uuid,
  version integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_funnel_version_v1_impl(
    target_workspace_id,
    target_funnel_id,
    expected_current_version,
    conversion_window_seconds,
    steps
  );
$$;

create function private.update_funnel_metadata_v1_impl(
  target_workspace_id uuid,
  target_funnel_id uuid,
  funnel_name text,
  funnel_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if char_length(btrim(coalesce(funnel_name, ''))) not between 1 and 120
    or (funnel_description is not null and char_length(funnel_description) > 2000)
  then
    raise exception 'FUNNEL_INVALID' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'funnels.manage'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  update public.funnels
  set
    name = btrim(funnel_name),
    description = funnel_description,
    updated_by = actor_id
  where id = target_funnel_id
    and workspace_id = target_workspace_id
    and status <> 'archived';

  if not found then
    raise exception 'FUNNEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  )
  values (
    target_workspace_id,
    actor_id,
    'funnel.metadata_updated',
    'funnel',
    target_funnel_id::text
  );
end;
$$;

create function public.update_funnel_metadata_v1(
  target_workspace_id uuid,
  target_funnel_id uuid,
  funnel_name text,
  funnel_description text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_funnel_metadata_v1_impl(
    target_workspace_id,
    target_funnel_id,
    funnel_name,
    funnel_description
  );
$$;

create function private.archive_funnel_v1_impl(
  target_workspace_id uuid,
  target_funnel_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_status public.funnel_status;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'funnels.manage'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  select f.status
  into current_status
  from public.funnels f
  where f.id = target_funnel_id
    and f.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'FUNNEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if current_status = 'archived' then
    return;
  end if;

  update public.funnels
  set
    status = 'archived',
    archived_at = now(),
    updated_by = actor_id
  where id = target_funnel_id
    and workspace_id = target_workspace_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  )
  values (
    target_workspace_id,
    actor_id,
    'funnel.archived',
    'funnel',
    target_funnel_id::text
  );
end;
$$;

create function public.archive_funnel_v1(
  target_workspace_id uuid,
  target_funnel_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.archive_funnel_v1_impl(
    target_workspace_id,
    target_funnel_id
  );
$$;

revoke all on function private.validate_funnel_steps_v1(jsonb)
  from public, anon, authenticated;
revoke all on function private.create_funnel_v1_impl(
  uuid, text, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function private.create_funnel_version_v1_impl(
  uuid, uuid, integer, integer, jsonb
) from public, anon, authenticated;
revoke all on function private.update_funnel_metadata_v1_impl(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function private.archive_funnel_v1_impl(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.create_funnel_v1(
  uuid, text, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.create_funnel_version_v1(
  uuid, uuid, integer, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.update_funnel_metadata_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.archive_funnel_v1(uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.create_funnel_v1_impl(
  uuid, text, text, integer, jsonb
) to authenticated;
grant execute on function private.create_funnel_version_v1_impl(
  uuid, uuid, integer, integer, jsonb
) to authenticated;
grant execute on function private.update_funnel_metadata_v1_impl(
  uuid, uuid, text, text
) to authenticated;
grant execute on function private.archive_funnel_v1_impl(uuid, uuid)
  to authenticated;

grant execute on function public.create_funnel_v1(
  uuid, text, text, integer, jsonb
) to authenticated;
grant execute on function public.create_funnel_version_v1(
  uuid, uuid, integer, integer, jsonb
) to authenticated;
grant execute on function public.update_funnel_metadata_v1(
  uuid, uuid, text, text
) to authenticated;
grant execute on function public.archive_funnel_v1(uuid, uuid)
  to authenticated;

grant execute on function private.create_funnel_v1_impl(
  uuid, text, text, integer, jsonb
) to service_role;
grant execute on function private.create_funnel_version_v1_impl(
  uuid, uuid, integer, integer, jsonb
) to service_role;
grant execute on function private.update_funnel_metadata_v1_impl(
  uuid, uuid, text, text
) to service_role;
grant execute on function private.archive_funnel_v1_impl(uuid, uuid)
  to service_role;

grant execute on function public.create_funnel_v1(
  uuid, text, text, integer, jsonb
) to service_role;
grant execute on function public.create_funnel_version_v1(
  uuid, uuid, integer, integer, jsonb
) to service_role;
grant execute on function public.update_funnel_metadata_v1(
  uuid, uuid, text, text
) to service_role;
grant execute on function public.archive_funnel_v1(uuid, uuid)
  to service_role;
