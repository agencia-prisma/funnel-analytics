-- EPIC 02 — Pixels + Domains + Tracking Configuration
-- Control plane only. Event ingestion and browser SDK activation remain for EPIC 03.

create type public.pixel_status as enum ('active', 'paused', 'archived');
create type public.pixel_health_status as enum ('pending', 'healthy', 'warning', 'critical');
create type public.pixel_domain_status as enum ('pending', 'active', 'blocked');

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
      'domains.manage'
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
      'domains.manage'
    ])
    when 'analyst' then target_permission = any (array[
      'workspace.view',
      'people.view',
      'pixels.view',
      'domains.view'
    ])
    when 'viewer' then target_permission = any (array[
      'workspace.view',
      'pixels.view',
      'domains.view'
    ])
    else false
  end;
$$;

create table public.pixels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  public_key text not null unique
    check (public_key ~ '^px_pub_[0-9a-f]{36}$'),
  status public.pixel_status not null default 'active',
  health_status public.pixel_health_status not null default 'pending',
  health_score smallint
    check (health_score is null or health_score between 0 and 100),
  last_event_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pixels_id_workspace_unique unique (id, workspace_id)
);

create table public.pixel_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pixel_id uuid not null,
  domain text not null
    check (
      char_length(domain) between 3 and 253
      and domain = lower(btrim(domain))
      and domain !~ '[/?:#@*]'
      and domain ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$'
    ),
  wildcard boolean not null default false,
  status public.pixel_domain_status not null default 'pending',
  verified_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pixel_domains_pixel_workspace_fkey
    foreign key (pixel_id, workspace_id)
    references public.pixels(id, workspace_id)
    on delete cascade,
  constraint pixel_domains_pixel_domain_unique unique (pixel_id, domain)
);

create index pixels_workspace_id_idx on public.pixels(workspace_id);
create index pixels_status_idx on public.pixels(status);
create index pixels_created_by_idx on public.pixels(created_by);

create index pixel_domains_workspace_id_idx
  on public.pixel_domains(workspace_id);
create index pixel_domains_pixel_workspace_idx
  on public.pixel_domains(pixel_id, workspace_id);
create index pixel_domains_domain_idx
  on public.pixel_domains(domain);

create trigger pixels_set_updated_at
before update on public.pixels
for each row execute function private.set_updated_at();

create trigger pixel_domains_set_updated_at
before update on public.pixel_domains
for each row execute function private.set_updated_at();

create function private.protect_pixel_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id
    or new.public_key <> old.public_key
    or new.created_by <> old.created_by
  then
    raise exception 'PIXEL_IMMUTABLE_FIELD' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger pixels_protect_identity
before update on public.pixels
for each row execute function private.protect_pixel_identity();

create function private.is_valid_configured_domain(target_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    target_domain is not null
    and char_length(target_domain) between 3 and 253
    and target_domain = lower(btrim(target_domain))
    and target_domain !~ '[/?:#@*]'
    and target_domain ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$';
$$;

create function private.create_pixel_impl(
  target_workspace_id uuid,
  pixel_name text,
  initial_domain text,
  initial_wildcard boolean
)
returns table (
  pixel_id uuid,
  public_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  generated_pixel_id uuid;
  generated_public_key text;
  generated_domain_id uuid;
  attempt_count integer := 0;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'pixels.create'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if nullif(btrim(pixel_name), '') is null
    or char_length(btrim(pixel_name)) > 120
  then
    raise exception 'PIXEL_INVALID_NAME' using errcode = 'P0001';
  end if;

  if initial_domain is not null
    and not private.is_valid_configured_domain(initial_domain)
  then
    raise exception 'DOMAIN_INVALID' using errcode = 'P0001';
  end if;

  loop
    attempt_count := attempt_count + 1;
    generated_public_key :=
      'px_pub_' || encode(extensions.gen_random_bytes(18), 'hex');

    begin
      insert into public.pixels (
        workspace_id,
        name,
        public_key,
        created_by
      )
      values (
        target_workspace_id,
        btrim(pixel_name),
        generated_public_key,
        actor_id
      )
      returning id into generated_pixel_id;

      exit;
    exception
      when unique_violation then
        if attempt_count >= 5 then
          raise;
        end if;
    end;
  end loop;

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
    'pixel.created',
    'pixel',
    generated_pixel_id::text,
    jsonb_build_object('status', 'active')
  );

  if initial_domain is not null then
    insert into public.pixel_domains (
      workspace_id,
      pixel_id,
      domain,
      wildcard
    )
    values (
      target_workspace_id,
      generated_pixel_id,
      initial_domain,
      coalesce(initial_wildcard, false)
    )
    returning id into generated_domain_id;

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
      'pixel.domain_added',
      'pixel_domain',
      generated_domain_id::text,
      jsonb_build_object('pixel_id', generated_pixel_id::text)
    );
  end if;

  return query
  select generated_pixel_id, generated_public_key;
end;
$$;

create function public.create_pixel(
  target_workspace_id uuid,
  pixel_name text,
  initial_domain text default null,
  initial_wildcard boolean default false
)
returns table (
  pixel_id uuid,
  public_key text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_pixel_impl(
    target_workspace_id,
    pixel_name,
    initial_domain,
    initial_wildcard
  );
$$;

create function private.update_pixel_impl(
  target_workspace_id uuid,
  target_pixel_id uuid,
  pixel_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_pixel public.pixels%rowtype;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into target_pixel
  from public.pixels p
  where p.id = target_pixel_id
    and p.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'PIXEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_pixel.workspace_id,
    actor_id,
    'pixels.update'
  ) then
    raise exception 'PIXEL_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if target_pixel.status = 'archived' then
    raise exception 'PIXEL_ARCHIVED' using errcode = 'P0001';
  end if;

  if nullif(btrim(pixel_name), '') is null
    or char_length(btrim(pixel_name)) > 120
  then
    raise exception 'PIXEL_INVALID_NAME' using errcode = 'P0001';
  end if;

  update public.pixels
  set name = btrim(pixel_name)
  where id = target_pixel_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  )
  values (
    target_pixel.workspace_id,
    actor_id,
    'pixel.updated',
    'pixel',
    target_pixel_id::text
  );
end;
$$;

create function public.update_pixel(
  target_workspace_id uuid,
  target_pixel_id uuid,
  pixel_name text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_pixel_impl(
    target_workspace_id,
    target_pixel_id,
    pixel_name
  );
$$;

create function private.set_pixel_status_impl(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_status public.pixel_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $
declare
  actor_id uuid := auth.uid();
  target_pixel public.pixels%rowtype;
  audit_action text;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into target_pixel
  from public.pixels p
  where p.id = target_pixel_id
    and p.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'PIXEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_pixel.workspace_id,
    actor_id,
    'pixels.update'
  ) then
    raise exception 'PIXEL_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if target_pixel.status = 'archived' and target_status <> 'archived' then
    raise exception 'PIXEL_ARCHIVED' using errcode = 'P0001';
  end if;

  if target_pixel.status = target_status then
    return;
  end if;

  audit_action := case target_status
    when 'paused' then 'pixel.paused'
    when 'active' then 'pixel.reactivated'
    when 'archived' then 'pixel.archived'
  end;

  update public.pixels
  set status = target_status
  where id = target_pixel_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_pixel.workspace_id,
    actor_id,
    audit_action,
    'pixel',
    target_pixel_id::text,
    jsonb_build_object(
      'from_status',
      target_pixel.status::text,
      'to_status',
      target_status::text
    )
  );
end;
$$;

create function public.set_pixel_status(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_status public.pixel_status
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_pixel_status_impl(
    target_workspace_id,
    target_pixel_id,
    target_status
  );
$$;

create function private.add_pixel_domain_impl(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_domain text,
  target_wildcard boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $
declare
  actor_id uuid := auth.uid();
  target_pixel public.pixels%rowtype;
  existing_domain public.pixel_domains%rowtype;
  domain_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into target_pixel
  from public.pixels p
  where p.id = target_pixel_id
    and p.workspace_id = target_workspace_id;

  if not found then
    raise exception 'PIXEL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_pixel.workspace_id,
    actor_id,
    'domains.manage'
  ) then
    raise exception 'PIXEL_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if target_pixel.status = 'archived' then
    raise exception 'PIXEL_ARCHIVED' using errcode = 'P0001';
  end if;

  if not private.is_valid_configured_domain(target_domain) then
    raise exception 'DOMAIN_INVALID' using errcode = 'P0001';
  end if;

  select *
  into existing_domain
  from public.pixel_domains pd
  where pd.pixel_id = target_pixel_id
    and pd.domain = target_domain
  for update;

  if found then
    if existing_domain.status <> 'blocked' then
      raise exception 'DOMAIN_DUPLICATE' using errcode = 'P0001';
    end if;

    update public.pixel_domains
    set
      status = 'pending',
      wildcard = coalesce(target_wildcard, false)
    where id = existing_domain.id;

    domain_id := existing_domain.id;
  else
    insert into public.pixel_domains (
      workspace_id,
      pixel_id,
      domain,
      wildcard
    )
    values (
      target_pixel.workspace_id,
      target_pixel_id,
      target_domain,
      coalesce(target_wildcard, false)
    )
    returning id into domain_id;
  end if;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_pixel.workspace_id,
    actor_id,
    'pixel.domain_added',
    'pixel_domain',
    domain_id::text,
    jsonb_build_object('pixel_id', target_pixel_id::text)
  );

  return domain_id;
end;
$$;

create function public.add_pixel_domain(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_domain text,
  target_wildcard boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.add_pixel_domain_impl(
    target_workspace_id,
    target_pixel_id,
    target_domain,
    target_wildcard
  );
$$;

create function private.remove_pixel_domain_impl(
  target_workspace_id uuid,
  target_domain_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_domain public.pixel_domains%rowtype;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into target_domain
  from public.pixel_domains pd
  where pd.id = target_domain_id
    and pd.workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'DOMAIN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_domain.workspace_id,
    actor_id,
    'domains.manage'
  ) then
    raise exception 'PIXEL_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if target_domain.status = 'blocked' then
    return;
  end if;

  update public.pixel_domains
  set status = 'blocked'
  where id = target_domain_id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_domain.workspace_id,
    actor_id,
    'pixel.domain_removed',
    'pixel_domain',
    target_domain_id::text,
    jsonb_build_object('pixel_id', target_domain.pixel_id::text)
  );
end;
$$;

create function public.remove_pixel_domain(
  target_workspace_id uuid,
  target_domain_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_pixel_domain_impl(
    target_workspace_id,
    target_domain_id
  );
$$;

alter table public.pixels enable row level security;
alter table public.pixel_domains enable row level security;

create policy pixels_select_authorized
on public.pixels
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'pixels.view'
  )
);

create policy pixels_insert_authorized
on public.pixels
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'pixels.create'
  )
);

create policy pixels_update_authorized
on public.pixels
for update
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'pixels.update'
  )
)
with check (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'pixels.update'
  )
);

create policy pixel_domains_select_authorized
on public.pixel_domains
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'domains.view'
  )
);

create policy pixel_domains_insert_authorized
on public.pixel_domains
for insert
to authenticated
with check (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'domains.manage'
  )
);

create policy pixel_domains_update_authorized
on public.pixel_domains
for update
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'domains.manage'
  )
)
with check (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'domains.manage'
  )
);

revoke all on public.pixels from anon, authenticated;
revoke all on public.pixel_domains from anon, authenticated;

grant select on public.pixels to authenticated;
grant select on public.pixel_domains to authenticated;

revoke all on function public.create_pixel(uuid, text, text, boolean)
from public, anon, authenticated;
revoke all on function public.update_pixel(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.set_pixel_status(uuid, uuid, public.pixel_status)
from public, anon, authenticated;
revoke all on function public.add_pixel_domain(uuid, uuid, text, boolean)
from public, anon, authenticated;
revoke all on function public.remove_pixel_domain(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.create_pixel(uuid, text, text, boolean)
to authenticated;
grant execute on function public.update_pixel(uuid, uuid, text)
to authenticated;
grant execute on function public.set_pixel_status(uuid, uuid, public.pixel_status)
to authenticated;
grant execute on function public.add_pixel_domain(uuid, uuid, text, boolean)
to authenticated;
grant execute on function public.remove_pixel_domain(uuid, uuid)
to authenticated;

revoke all on function private.protect_pixel_identity()
from public, anon, authenticated;
revoke all on function private.is_valid_configured_domain(text)
from public, anon, authenticated;
revoke all on function private.create_pixel_impl(uuid, text, text, boolean)
from public, anon, authenticated;
revoke all on function private.update_pixel_impl(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function private.set_pixel_status_impl(uuid, uuid, public.pixel_status)
from public, anon, authenticated;
revoke all on function private.add_pixel_domain_impl(uuid, uuid, text, boolean)
from public, anon, authenticated;
revoke all on function private.remove_pixel_domain_impl(uuid, uuid)
from public, anon, authenticated;

grant execute on function private.create_pixel_impl(uuid, text, text, boolean)
to authenticated;
grant execute on function private.update_pixel_impl(uuid, uuid, text)
to authenticated;
grant execute on function private.set_pixel_status_impl(uuid, uuid, public.pixel_status)
to authenticated;
grant execute on function private.add_pixel_domain_impl(uuid, uuid, text, boolean)
to authenticated;
grant execute on function private.remove_pixel_domain_impl(uuid, uuid)
to authenticated;
