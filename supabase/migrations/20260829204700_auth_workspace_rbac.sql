-- EPIC 01 — Auth + Workspace + RBAC
-- First business schema. Designed for Supabase Auth + RLS multi-tenancy.

create schema if not exists private;
revoke all on schema private from public;

create type public.workspace_status as enum ('active', 'suspended', 'deleted');
create type public.workspace_role as enum ('owner', 'admin', 'analyst', 'viewer');
create type public.workspace_member_status as enum ('active', 'suspended');
create type public.workspace_invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/Sao_Paulo' check (char_length(btrim(timezone)) > 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status public.workspace_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  status public.workspace_member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  permission text not null check (char_length(btrim(permission)) > 0),
  allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_permission_overrides_membership_fkey
    foreign key (workspace_id, user_id)
    references public.workspace_members(workspace_id, user_id)
    on delete cascade,
  constraint member_permission_overrides_unique
    unique (workspace_id, user_id, permission)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  role public.workspace_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.workspace_invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_acceptance_consistency check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or
    (status <> 'accepted' and accepted_by is null and accepted_at is null)
  )
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(btrim(action)) > 0),
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_members_user_id_idx
  on public.workspace_members(user_id);
create index workspace_members_workspace_id_idx
  on public.workspace_members(workspace_id);
create index workspace_invitations_workspace_id_idx
  on public.workspace_invitations(workspace_id);
create index workspace_invitations_email_normalized_idx
  on public.workspace_invitations(email_normalized);
create unique index workspace_invitations_pending_email_uq
  on public.workspace_invitations(workspace_id, email_normalized)
  where status = 'pending';
create index member_permission_overrides_workspace_id_idx
  on public.member_permission_overrides(workspace_id);
create index member_permission_overrides_user_id_idx
  on public.member_permission_overrides(user_id);
create index audit_logs_workspace_id_idx
  on public.audit_logs(workspace_id);
create index audit_logs_created_at_idx
  on public.audit_logs(created_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function private.set_updated_at();

create trigger member_permission_overrides_set_updated_at
before update on public.member_permission_overrides
for each row execute function private.set_updated_at();

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.is_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_user_id
      and wm.status = 'active'
      and w.status = 'active'
  );
$$;

create function private.users_share_workspace(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members first_member
    join public.workspace_members second_member
      on second_member.workspace_id = first_member.workspace_id
    join public.workspaces w
      on w.id = first_member.workspace_id
    where first_member.user_id = first_user_id
      and second_member.user_id = second_user_id
      and first_member.status = 'active'
      and second_member.status = 'active'
      and w.status = 'active'
  );
$$;

create function private.get_workspace_role(
  target_workspace_id uuid,
  target_user_id uuid
)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select wm.role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id
    and wm.status = 'active'
    and w.status = 'active'
  limit 1;
$$;

create function private.role_has_permission(
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
      'people.view_pii'
    ])
    when 'admin' then target_permission = any (array[
      'workspace.view',
      'workspace.update',
      'members.view',
      'members.invite',
      'members.update_role',
      'members.remove',
      'people.view'
    ])
    when 'analyst' then target_permission = any (array[
      'workspace.view',
      'people.view'
    ])
    when 'viewer' then target_permission = 'workspace.view'
    else false
  end;
$$;

create function private.permission_allowed(
  target_workspace_id uuid,
  target_user_id uuid,
  target_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  override_value boolean;
  member_role public.workspace_role;
begin
  if not private.is_workspace_member(target_workspace_id, target_user_id) then
    return false;
  end if;

  select mpo.allowed
  into override_value
  from public.member_permission_overrides mpo
  where mpo.workspace_id = target_workspace_id
    and mpo.user_id = target_user_id
    and mpo.permission = target_permission;

  if found then
    return override_value;
  end if;

  member_role := private.get_workspace_role(target_workspace_id, target_user_id);
  return private.role_has_permission(member_role, target_permission);
end;
$$;

create function public.has_workspace_permission(
  target_workspace_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.permission_allowed(
    target_workspace_id,
    (select auth.uid()),
    target_permission
  );
$$;

create function private.create_workspace_impl(
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
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
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

create function public.create_workspace(
  workspace_name text,
  workspace_slug text,
  workspace_timezone text,
  workspace_currency char(3)
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_workspace_impl(
    workspace_name,
    workspace_slug,
    workspace_timezone,
    workspace_currency
  );
$$;

create function private.create_workspace_invitation_impl(
  target_workspace_id uuid,
  invite_email text,
  invite_role public.workspace_role,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.workspace_role;
  normalized_email text := lower(btrim(invite_email));
  invitation_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(target_workspace_id, actor_id, 'members.invite') then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  actor_role := private.get_workspace_role(target_workspace_id, actor_id);

  if invite_role = 'owner'
    or (actor_role = 'admin' and invite_role not in ('analyst', 'viewer'))
  then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if normalized_email = '' or position('@' in normalized_email) <= 1 then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;

  if invite_token_hash !~ '^[0-9a-f]{64}$'
    or invite_expires_at <= now()
  then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    where wm.workspace_id = target_workspace_id
      and lower(btrim(u.email)) = normalized_email
  ) then
    raise exception 'INVITATION_ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.workspace_invitations (
    workspace_id,
    email_normalized,
    role,
    token_hash,
    invited_by,
    expires_at
  )
  values (
    target_workspace_id,
    normalized_email,
    invite_role,
    invite_token_hash,
    actor_id,
    invite_expires_at
  )
  returning id into invitation_id;

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
    'workspace.member_invited',
    'workspace_invitation',
    invitation_id::text,
    jsonb_build_object('role', invite_role::text)
  );

  return invitation_id;
exception
  when unique_violation then
    raise exception 'INVITATION_DUPLICATE' using errcode = 'P0001';
end;
$$;

create function public.create_workspace_invitation(
  target_workspace_id uuid,
  invite_email text,
  invite_role public.workspace_role,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_workspace_invitation_impl(
    target_workspace_id,
    invite_email,
    invite_role,
    invite_token_hash,
    invite_expires_at
  );
$$;

create function private.get_workspace_invitation_impl(invite_token_hash text)
returns table (
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  role public.workspace_role,
  status public.workspace_invitation_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    wi.id,
    wi.workspace_id,
    w.name,
    wi.role,
    case
      when wi.status = 'pending' and wi.expires_at <= now()
        then 'expired'::public.workspace_invitation_status
      else wi.status
    end,
    wi.expires_at
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  where wi.token_hash = invite_token_hash
    and w.status = 'active'
  limit 1;
$$;

create function public.get_workspace_invitation(invite_token_hash text)
returns table (
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  role public.workspace_role,
  status public.workspace_invitation_status,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_workspace_invitation_impl(invite_token_hash);
$$;

create function private.accept_workspace_invitation_impl(invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.workspace_invitations%rowtype;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select lower(btrim(u.email))
  into actor_email
  from auth.users u
  where u.id = actor_id;

  select *
  into invitation
  from public.workspace_invitations wi
  where wi.token_hash = invite_token_hash
  for update;

  if not found then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;

  if invitation.status = 'accepted' then
    raise exception 'INVITATION_ALREADY_USED' using errcode = 'P0001';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;

  if invitation.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
  end if;

  if actor_email is null or actor_email <> invitation.email_normalized then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = invitation.workspace_id
      and wm.user_id = actor_id
  ) then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status
  )
  values (
    invitation.workspace_id,
    actor_id,
    invitation.role,
    'active'
  );

  update public.workspace_invitations
  set
    status = 'accepted',
    accepted_by = actor_id,
    accepted_at = now()
  where id = invitation.id;

  insert into public.audit_logs (
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    invitation.workspace_id,
    actor_id,
    'workspace.invitation_accepted',
    'workspace_invitation',
    invitation.id::text,
    jsonb_build_object('role', invitation.role::text)
  );

  return invitation.workspace_id;
end;
$$;

create function public.accept_workspace_invitation(invite_token_hash text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_workspace_invitation_impl(invite_token_hash);
$$;

create function private.change_workspace_member_role_impl(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.workspace_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.workspace_role;
  current_target_role public.workspace_role;
  active_owner_count integer;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(target_workspace_id, actor_id, 'members.update_role') then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  actor_role := private.get_workspace_role(target_workspace_id, actor_id);

  select wm.role
  into current_target_role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id
    and wm.status = 'active'
  for update;

  if not found then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if actor_role = 'admin'
    and (
      current_target_role not in ('analyst', 'viewer')
      or target_role not in ('analyst', 'viewer')
    )
  then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if current_target_role = 'owner' and target_role <> 'owner' then
    select count(*)
    into active_owner_count
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.role = 'owner'
      and wm.status = 'active';

    if active_owner_count <= 1 then
      raise exception 'LAST_OWNER_PROTECTION' using errcode = 'P0001';
    end if;
  end if;

  update public.workspace_members
  set role = target_role
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

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
    'workspace.member_role_changed',
    'workspace_member',
    target_user_id::text,
    jsonb_build_object(
      'from_role',
      current_target_role::text,
      'to_role',
      target_role::text
    )
  );
end;
$$;

create function public.change_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.workspace_role
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.change_workspace_member_role_impl(
    target_workspace_id,
    target_user_id,
    target_role
  );
$$;

create function private.remove_workspace_member_impl(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.workspace_role;
  target_member_role public.workspace_role;
  active_owner_count integer;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(target_workspace_id, actor_id, 'members.remove') then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  actor_role := private.get_workspace_role(target_workspace_id, actor_id);

  select wm.role
  into target_member_role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id
    and wm.status = 'active'
  for update;

  if not found then
    raise exception 'WORKSPACE_MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if actor_role = 'admin' and target_member_role not in ('analyst', 'viewer') then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if target_member_role = 'owner' then
    select count(*)
    into active_owner_count
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.role = 'owner'
      and wm.status = 'active';

    if active_owner_count <= 1 then
      raise exception 'LAST_OWNER_PROTECTION' using errcode = 'P0001';
    end if;
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id;

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
    'workspace.member_removed',
    'workspace_member',
    target_user_id::text,
    jsonb_build_object('role', target_member_role::text)
  );
end;
$$;

create function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_workspace_member_impl(
    target_workspace_id,
    target_user_id
  );
$$;

create function private.list_workspace_members_impl(target_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.workspace_role,
  status public.workspace_member_status,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.workspace_role;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(target_workspace_id, actor_id, 'members.view') then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  actor_role := private.get_workspace_role(target_workspace_id, actor_id);

  return query
  select
    wm.user_id,
    p.display_name,
    case
      when actor_role in ('owner', 'admin') then u.email
      else null
    end,
    wm.role,
    wm.status,
    wm.created_at
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = target_workspace_id
  order by wm.created_at asc;
end;
$$;

create function public.list_workspace_members(target_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role public.workspace_role,
  status public.workspace_member_status,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_workspace_members_impl(target_workspace_id);
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.member_permission_overrides enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_shared_workspace
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.users_share_workspace(id, (select auth.uid()))
);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy workspaces_select_members
on public.workspaces
for select
to authenticated
using (
  private.is_workspace_member(id, (select auth.uid()))
);

create policy workspaces_update_authorized
on public.workspaces
for update
to authenticated
using (
  private.permission_allowed(id, (select auth.uid()), 'workspace.update')
)
with check (
  private.permission_allowed(id, (select auth.uid()), 'workspace.update')
);

create policy workspace_members_select_authorized
on public.workspace_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'members.view'
  )
);

create policy permission_overrides_select_authorized
on public.member_permission_overrides
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'members.view'
  )
);

revoke all on public.profiles from anon, authenticated;
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
revoke all on public.member_permission_overrides from anon, authenticated;
revoke all on public.workspace_invitations from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, updated_at) on public.profiles to authenticated;

grant select on public.workspaces to authenticated;
grant update (name, timezone, currency, updated_at) on public.workspaces to authenticated;

grant select on public.workspace_members to authenticated;
grant select on public.member_permission_overrides to authenticated;

revoke all on function public.has_workspace_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.create_workspace(text, text, text, char(3)) from public, anon, authenticated;
revoke all on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_workspace_invitation(text) from public, anon, authenticated;
revoke all on function public.accept_workspace_invitation(text) from public, anon, authenticated;
revoke all on function public.change_workspace_member_role(uuid, uuid, public.workspace_role) from public, anon, authenticated;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_workspace_members(uuid) from public, anon, authenticated;

grant execute on function public.has_workspace_permission(uuid, text) to authenticated;
grant execute on function public.create_workspace(text, text, text, char(3)) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, public.workspace_role, text, timestamptz) to authenticated;
grant execute on function public.get_workspace_invitation(text) to anon, authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.change_workspace_member_role(uuid, uuid, public.workspace_role) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;

grant usage on schema private to anon, authenticated;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_workspace_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.users_share_workspace(uuid, uuid) from public, anon, authenticated;
revoke all on function private.get_workspace_role(uuid, uuid) from public, anon, authenticated;
revoke all on function private.role_has_permission(public.workspace_role, text) from public, anon, authenticated;
revoke all on function private.permission_allowed(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.create_workspace_impl(text, text, text, char(3)) from public, anon, authenticated;
revoke all on function private.create_workspace_invitation_impl(uuid, text, public.workspace_role, text, timestamptz) from public, anon, authenticated;
revoke all on function private.get_workspace_invitation_impl(text) from public, anon, authenticated;
revoke all on function private.accept_workspace_invitation_impl(text) from public, anon, authenticated;
revoke all on function private.change_workspace_member_role_impl(uuid, uuid, public.workspace_role) from public, anon, authenticated;
revoke all on function private.remove_workspace_member_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function private.list_workspace_members_impl(uuid) from public, anon, authenticated;

grant execute on function private.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function private.users_share_workspace(uuid, uuid) to authenticated;
grant execute on function private.get_workspace_role(uuid, uuid) to authenticated;
grant execute on function private.role_has_permission(public.workspace_role, text) to authenticated;
grant execute on function private.permission_allowed(uuid, uuid, text) to authenticated;
grant execute on function private.create_workspace_impl(text, text, text, char(3)) to authenticated;
grant execute on function private.create_workspace_invitation_impl(uuid, text, public.workspace_role, text, timestamptz) to authenticated;
grant execute on function private.get_workspace_invitation_impl(text) to anon, authenticated;
grant execute on function private.accept_workspace_invitation_impl(text) to authenticated;
grant execute on function private.change_workspace_member_role_impl(uuid, uuid, public.workspace_role) to authenticated;
grant execute on function private.remove_workspace_member_impl(uuid, uuid) to authenticated;
grant execute on function private.list_workspace_members_impl(uuid) to authenticated;
