-- EPIC 07 — Identity Foundation
-- Canonical identity lives in Supabase. PII is encrypted before reaching this schema.

create type public.person_status as enum ('active', 'merged', 'deleted');

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.person_status not null default 'active',
  merged_into_person_id uuid,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint persons_workspace_id_id_unique unique (workspace_id, id),
  constraint persons_seen_order check (last_seen_at >= first_seen_at),
  constraint persons_status_consistency check (
    (status = 'active' and merged_into_person_id is null and deleted_at is null)
    or
    (status = 'merged' and merged_into_person_id is not null and deleted_at is null)
    or
    (status = 'deleted' and merged_into_person_id is null and deleted_at is not null)
  ),
  constraint persons_not_self_merged check (
    merged_into_person_id is null or merged_into_person_id <> id
  ),
  constraint persons_merged_target_workspace_fkey
    foreign key (workspace_id, merged_into_person_id)
    references public.persons(workspace_id, id)
    on delete restrict
);

create table public.person_visitor_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null,
  visitor_id uuid not null,
  pixel_id uuid,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source text not null
    check (source in ('manual_browser_identify')),
  confidence text not null
    check (confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_visitor_links_seen_order
    check (last_seen_at >= first_seen_at),
  constraint person_visitor_links_person_workspace_fkey
    foreign key (workspace_id, person_id)
    references public.persons(workspace_id, id)
    on delete cascade,
  constraint person_visitor_links_pixel_workspace_fkey
    foreign key (pixel_id, workspace_id)
    references public.pixels(id, workspace_id)
    on delete restrict,
  constraint person_visitor_links_workspace_visitor_unique
    unique (workspace_id, visitor_id)
);

create table private.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null,
  identifier_type text not null
    check (identifier_type in ('email', 'phone', 'cpf', 'name')),
  blind_index text not null
    check (blind_index ~ '^[0-9a-f]{64}$'),
  encrypted_value text not null
    check (char_length(encrypted_value) between 24 and 4096),
  encryption_key_version integer not null
    check (encryption_key_version >= 1),
  source text not null
    check (source in ('manual_browser_identify')),
  confidence text not null
    check (confidence in ('low', 'medium', 'high')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_identifiers_seen_order
    check (last_seen_at >= first_seen_at),
  constraint person_identifiers_person_workspace_fkey
    foreign key (workspace_id, person_id)
    references public.persons(workspace_id, id)
    on delete cascade,
  constraint person_identifiers_person_type_blind_unique
    unique (person_id, identifier_type, blind_index)
);

create unique index person_identifiers_strong_identity_uq
  on private.person_identifiers(
    workspace_id,
    identifier_type,
    blind_index
  )
  where identifier_type in ('email', 'phone', 'cpf');

create index person_identifiers_person_idx
  on private.person_identifiers(workspace_id, person_id);

create index person_identifiers_blind_lookup_idx
  on private.person_identifiers(
    workspace_id,
    identifier_type,
    blind_index
  );

create table private.person_merge_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_person_id uuid not null,
  target_person_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  source text not null check (char_length(btrim(source)) between 1 and 80),
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint person_merge_history_source_workspace_fkey
    foreign key (workspace_id, source_person_id)
    references public.persons(workspace_id, id)
    on delete restrict,
  constraint person_merge_history_target_workspace_fkey
    foreign key (workspace_id, target_person_id)
    references public.persons(workspace_id, id)
    on delete restrict,
  constraint person_merge_history_distinct_people
    check (source_person_id <> target_person_id)
);

create index persons_workspace_status_idx
  on public.persons(workspace_id, status);

create index persons_workspace_last_seen_idx
  on public.persons(workspace_id, last_seen_at desc);

create index person_visitor_links_person_idx
  on public.person_visitor_links(workspace_id, person_id);

create index person_visitor_links_pixel_idx
  on public.person_visitor_links(workspace_id, pixel_id)
  where pixel_id is not null;

create trigger persons_set_updated_at
before update on public.persons
for each row execute function private.set_updated_at();

create trigger person_visitor_links_set_updated_at
before update on public.person_visitor_links
for each row execute function private.set_updated_at();

create trigger person_identifiers_set_updated_at
before update on private.person_identifiers
for each row execute function private.set_updated_at();

alter table public.persons enable row level security;
alter table public.person_visitor_links enable row level security;
alter table private.person_identifiers enable row level security;
alter table private.person_merge_history enable row level security;

create policy persons_select_people_view
on public.persons
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'people.view'
  )
);

create policy person_visitor_links_select_people_view
on public.person_visitor_links
for select
to authenticated
using (
  private.permission_allowed(
    workspace_id,
    (select auth.uid()),
    'people.view'
  )
);

revoke all on public.persons from public, anon, authenticated;
revoke all on public.person_visitor_links from public, anon, authenticated;
grant select on public.persons to authenticated;
grant select on public.person_visitor_links to authenticated;
grant all on public.persons to service_role;
grant all on public.person_visitor_links to service_role;

revoke all on private.person_identifiers from public, anon, authenticated;
revoke all on private.person_merge_history from public, anon, authenticated;
grant all on private.person_identifiers to service_role;
grant all on private.person_merge_history to service_role;
grant usage on schema private to service_role;

create function private.resolve_identity_v1_impl(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_visitor_id uuid,
  target_session_id uuid,
  observed_at timestamptz,
  protected_identifiers jsonb,
  identity_source text,
  identity_confidence text,
  target_test_mode boolean
)
returns table (
  resolution_status text,
  person_id uuid,
  person_created boolean,
  visitor_link_created boolean,
  linked_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_person_ids uuid[];
  matched_person_id uuid;
  existing_visitor_person_id uuid;
  target_person_id uuid;
  new_person boolean := false;
  new_link boolean := false;
  item jsonb;
  item_id uuid;
  lock_key text;
  existing_link_first_seen_at timestamptz;
  existing_link_last_seen_at timestamptz;
begin
  if target_workspace_id is null
    or target_pixel_id is null
    or target_visitor_id is null
    or observed_at is null
    or protected_identifiers is null
    or jsonb_typeof(protected_identifiers) <> 'array'
    or jsonb_array_length(protected_identifiers) < 1
    or jsonb_array_length(protected_identifiers) > 4
    or identity_source <> 'manual_browser_identify'
    or identity_confidence not in ('low', 'medium', 'high')
  then
    raise exception 'IDENTITY_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.status = 'active'
  ) then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.pixels p
    where p.id = target_pixel_id
      and p.workspace_id = target_workspace_id
      and p.status = 'active'
  ) then
    raise exception 'PIXEL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(protected_identifiers) value(item_value)
    where (item_value ->> 'type') not in ('email', 'phone', 'cpf', 'name')
      or coalesce(item_value ->> 'blind_index', '') !~ '^[0-9a-f]{64}$'
      or char_length(coalesce(item_value ->> 'encrypted_value', '')) not between 24 and 4096
      or coalesce(item_value ->> 'encryption_key_version', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'IDENTITY_INVALID' using errcode = 'P0001';
  end if;

  for lock_key in
    select
      (value ->> 'type') || ':' || (value ->> 'blind_index')
    from jsonb_array_elements(protected_identifiers) value
    where (value ->> 'type') in ('email', 'phone', 'cpf')
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        target_workspace_id::text || ':' || lock_key,
        0
      )
    );
  end loop;

  select pvl.person_id, pvl.first_seen_at, pvl.last_seen_at
  into
    existing_visitor_person_id,
    existing_link_first_seen_at,
    existing_link_last_seen_at
  from public.person_visitor_links pvl
  where pvl.workspace_id = target_workspace_id
    and pvl.visitor_id = target_visitor_id
  for update;

  select array_agg(distinct resolved_person_id order by resolved_person_id)
  into candidate_person_ids
  from (
    select
      case
        when p.status = 'merged' then p.merged_into_person_id
        else p.id
      end as resolved_person_id
    from private.person_identifiers pi
    join jsonb_array_elements(protected_identifiers) value
      on pi.identifier_type = value ->> 'type'
      and pi.blind_index = value ->> 'blind_index'
    join public.persons p
      on p.id = pi.person_id
      and p.workspace_id = pi.workspace_id
    where pi.workspace_id = target_workspace_id
      and pi.identifier_type in ('email', 'phone', 'cpf')
      and p.status <> 'deleted'
  ) matches
  where resolved_person_id is not null;

  if coalesce(array_length(candidate_person_ids, 1), 0) > 1 then
    insert into public.audit_logs (
      workspace_id,
      actor_user_id,
      action,
      resource_type,
      metadata
    )
    values (
      target_workspace_id,
      null,
      'person.identity_conflict',
      'person',
      jsonb_build_object(
        'source',
        identity_source,
        'identifier_count',
        jsonb_array_length(protected_identifiers)
      )
    );

    return query
    select
      'IDENTITY_CONFLICT'::text,
      null::uuid,
      false,
      false,
      observed_at,
      observed_at;
    return;
  end if;

  if coalesce(array_length(candidate_person_ids, 1), 0) = 1 then
    matched_person_id := candidate_person_ids[1];
  end if;

  if existing_visitor_person_id is not null
    and matched_person_id is not null
    and existing_visitor_person_id <> matched_person_id
  then
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
      null,
      'person.identity_conflict',
      'person_visitor_link',
      null,
      jsonb_build_object('source', identity_source, 'kind', 'visitor')
    );

    return query
    select
      'VISITOR_IDENTITY_CONFLICT'::text,
      null::uuid,
      false,
      false,
      observed_at,
      observed_at;
    return;
  end if;

  target_person_id := coalesce(
    matched_person_id,
    existing_visitor_person_id
  );

  if target_person_id is null then
    insert into public.persons (
      workspace_id,
      first_seen_at,
      last_seen_at
    )
    values (
      target_workspace_id,
      observed_at,
      observed_at
    )
    returning id into target_person_id;

    new_person := true;

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
      null,
      'person.created',
      'person',
      target_person_id::text,
      jsonb_build_object('source', identity_source)
    );
  else
    update public.persons p
    set
      first_seen_at = least(p.first_seen_at, observed_at),
      last_seen_at = greatest(p.last_seen_at, observed_at)
    where p.id = target_person_id
      and p.workspace_id = target_workspace_id
      and p.status = 'active';

    if not found then
      raise exception 'IDENTITY_PERSON_NOT_ACTIVE' using errcode = 'P0001';
    end if;
  end if;

  for item in
    select value
    from jsonb_array_elements(protected_identifiers) value
  loop
    item_id := null;

    if item ->> 'type' in ('email', 'phone', 'cpf') then
      insert into private.person_identifiers (
        workspace_id,
        person_id,
        identifier_type,
        blind_index,
        encrypted_value,
        encryption_key_version,
        source,
        confidence,
        first_seen_at,
        last_seen_at
      )
      values (
        target_workspace_id,
        target_person_id,
        item ->> 'type',
        item ->> 'blind_index',
        item ->> 'encrypted_value',
        (item ->> 'encryption_key_version')::integer,
        identity_source,
        identity_confidence,
        observed_at,
        observed_at
      )
      on conflict (
        workspace_id,
        identifier_type,
        blind_index
      )
      where identifier_type in ('email', 'phone', 'cpf')
      do nothing
      returning id into item_id;

      if item_id is null then
        update private.person_identifiers pi
        set
          encrypted_value = item ->> 'encrypted_value',
          encryption_key_version =
            (item ->> 'encryption_key_version')::integer,
          last_seen_at = greatest(pi.last_seen_at, observed_at),
          source = identity_source,
          confidence = identity_confidence
        where pi.workspace_id = target_workspace_id
          and pi.person_id = target_person_id
          and pi.identifier_type = item ->> 'type'
          and pi.blind_index = item ->> 'blind_index';
      end if;
    else
      insert into private.person_identifiers (
        workspace_id,
        person_id,
        identifier_type,
        blind_index,
        encrypted_value,
        encryption_key_version,
        source,
        confidence,
        first_seen_at,
        last_seen_at
      )
      values (
        target_workspace_id,
        target_person_id,
        item ->> 'type',
        item ->> 'blind_index',
        item ->> 'encrypted_value',
        (item ->> 'encryption_key_version')::integer,
        identity_source,
        identity_confidence,
        observed_at,
        observed_at
      )
      on conflict on constraint
        person_identifiers_person_type_blind_unique
      do nothing
      returning id into item_id;

      if item_id is null then
        update private.person_identifiers pi
        set
          encrypted_value = item ->> 'encrypted_value',
          encryption_key_version =
            (item ->> 'encryption_key_version')::integer,
          last_seen_at = greatest(pi.last_seen_at, observed_at),
          source = identity_source,
          confidence = identity_confidence
        where pi.person_id = target_person_id
          and pi.identifier_type = item ->> 'type'
          and pi.blind_index = item ->> 'blind_index';
      end if;
    end if;

    if item_id is not null then
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
        null,
        'person.identifier_added',
        'person',
        target_person_id::text,
        jsonb_build_object(
          'identifier_type',
          item ->> 'type',
          'source',
          identity_source
        )
      );
    end if;
  end loop;

  if existing_visitor_person_id is null then
    insert into public.person_visitor_links (
      workspace_id,
      person_id,
      visitor_id,
      pixel_id,
      first_seen_at,
      last_seen_at,
      source,
      confidence
    )
    values (
      target_workspace_id,
      target_person_id,
      target_visitor_id,
      target_pixel_id,
      observed_at,
      observed_at,
      identity_source,
      identity_confidence
    );

    new_link := true;
    existing_link_first_seen_at := observed_at;
    existing_link_last_seen_at := observed_at;

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
      null,
      'person.visitor_linked',
      'person',
      target_person_id::text,
      jsonb_build_object(
        'source',
        identity_source,
        'pixel_id',
        target_pixel_id::text
      )
    );
  else
    update public.person_visitor_links pvl
    set
      pixel_id = target_pixel_id,
      first_seen_at = least(pvl.first_seen_at, observed_at),
      last_seen_at = greatest(pvl.last_seen_at, observed_at),
      source = identity_source,
      confidence = identity_confidence
    where pvl.workspace_id = target_workspace_id
      and pvl.visitor_id = target_visitor_id
      and pvl.person_id = target_person_id
    returning
      pvl.first_seen_at,
      pvl.last_seen_at
    into
      existing_link_first_seen_at,
      existing_link_last_seen_at;
  end if;

  return query
  select
    'RESOLVED'::text,
    target_person_id,
    new_person,
    new_link,
    coalesce(existing_link_first_seen_at, observed_at),
    coalesce(existing_link_last_seen_at, observed_at);
end;
$$;

create function public.resolve_identity_v1(
  target_workspace_id uuid,
  target_pixel_id uuid,
  target_visitor_id uuid,
  target_session_id uuid,
  observed_at timestamptz,
  protected_identifiers jsonb,
  identity_source text,
  identity_confidence text,
  target_test_mode boolean
)
returns table (
  resolution_status text,
  person_id uuid,
  person_created boolean,
  visitor_link_created boolean,
  linked_at timestamptz,
  last_seen_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.resolve_identity_v1_impl(
    target_workspace_id,
    target_pixel_id,
    target_visitor_id,
    target_session_id,
    observed_at,
    protected_identifiers,
    identity_source,
    identity_confidence,
    target_test_mode
  );
$$;

create function private.get_person_identifier_ciphertexts_impl(
  target_workspace_id uuid,
  target_person_id uuid
)
returns table (
  identifier_type text,
  encrypted_value text,
  encryption_key_version integer
)
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

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'people.view_pii'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.persons p
    where p.id = target_person_id
      and p.workspace_id = target_workspace_id
      and p.status <> 'deleted'
  ) then
    raise exception 'PERSON_NOT_FOUND' using errcode = 'P0001';
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
    'person.pii_viewed',
    'person',
    target_person_id::text
  );

  return query
  select
    pi.identifier_type,
    pi.encrypted_value,
    pi.encryption_key_version
  from private.person_identifiers pi
  where pi.workspace_id = target_workspace_id
    and pi.person_id = target_person_id
  order by pi.identifier_type, pi.created_at;
end;
$$;

create function public.get_person_identifier_ciphertexts(
  target_workspace_id uuid,
  target_person_id uuid
)
returns table (
  identifier_type text,
  encrypted_value text,
  encryption_key_version integer
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.get_person_identifier_ciphertexts_impl(
    target_workspace_id,
    target_person_id
  );
$$;

create function private.find_person_by_blind_index_impl(
  target_workspace_id uuid,
  target_identifier_type text,
  target_blind_index text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result_person_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not private.permission_allowed(
    target_workspace_id,
    actor_id,
    'people.view_pii'
  ) then
    raise exception 'INSUFFICIENT_PERMISSION' using errcode = 'P0001';
  end if;

  if target_identifier_type not in ('email', 'phone', 'cpf')
    or target_blind_index !~ '^[0-9a-f]{64}$'
  then
    raise exception 'IDENTITY_INVALID' using errcode = 'P0001';
  end if;

  select pi.person_id
  into result_person_id
  from private.person_identifiers pi
  join public.persons p
    on p.id = pi.person_id
    and p.workspace_id = pi.workspace_id
  where pi.workspace_id = target_workspace_id
    and pi.identifier_type = target_identifier_type
    and pi.blind_index = target_blind_index
    and p.status = 'active'
  order by pi.last_seen_at desc
  limit 1;

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
    'person.pii_searched',
    'person',
    result_person_id::text,
    jsonb_build_object('identifier_type', target_identifier_type)
  );

  return result_person_id;
end;
$$;

create function public.find_person_by_blind_index(
  target_workspace_id uuid,
  target_identifier_type text,
  target_blind_index text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.find_person_by_blind_index_impl(
    target_workspace_id,
    target_identifier_type,
    target_blind_index
  );
$$;

revoke all on function private.resolve_identity_v1_impl(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.resolve_identity_v1(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text, text, boolean
) from public, anon, authenticated;

grant execute on function private.resolve_identity_v1_impl(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text, text, boolean
) to service_role;
grant execute on function public.resolve_identity_v1(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text, text, boolean
) to service_role;

revoke all on function private.get_person_identifier_ciphertexts_impl(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function public.get_person_identifier_ciphertexts(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function private.get_person_identifier_ciphertexts_impl(
  uuid, uuid
) to authenticated;
grant execute on function public.get_person_identifier_ciphertexts(
  uuid, uuid
) to authenticated;

revoke all on function private.find_person_by_blind_index_impl(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.find_person_by_blind_index(
  uuid, text, text
) from public, anon, authenticated;

grant execute on function private.find_person_by_blind_index_impl(
  uuid, text, text
) to authenticated;
grant execute on function public.find_person_by_blind_index(
  uuid, text, text
) to authenticated;