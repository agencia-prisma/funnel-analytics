begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'identity-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'identity-analyst-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('12000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'identity-viewer-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('12000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'identity-owner-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, slug, created_by)
values
  ('22000000-0000-0000-0000-000000000001', 'Identity Workspace A', 'identity-workspace-a', '12000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000002', 'Identity Workspace B', 'identity-workspace-b', '12000000-0000-0000-0000-000000000004');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'owner'),
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 'analyst'),
  ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000003', 'viewer'),
  ('22000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000004', 'owner');

insert into public.pixels (
  id,
  workspace_id,
  name,
  public_key,
  created_by
)
values
  (
    '32000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Identity Pixel A',
    'px_pub_dddddddddddddddddddddddddddddddddddd',
    '12000000-0000-0000-0000-000000000001'
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'Identity Pixel B',
    'px_pub_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    '12000000-0000-0000-0000-000000000004'
  );

set local role service_role;

create temporary table identity_resolution_1 as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-7000-8000-000000000001',
  null,
  '2026-08-31T23:00:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'email',
      'blind_index', repeat('a', 64),
      'encrypted_value', 'aes256gcm.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

select is(
  (select resolution_status from identity_resolution_1),
  'RESOLVED',
  'New strong identifier resolves successfully'
);

select ok(
  (select person_created from identity_resolution_1),
  'First strong identifier creates a Person'
);

create temporary table identity_resolution_2 as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-7000-8000-000000000002',
  null,
  '2026-08-31T23:01:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'email',
      'blind_index', repeat('a', 64),
      'encrypted_value', 'aes256gcm.CCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

select is(
  (select person_id from identity_resolution_2),
  (select person_id from identity_resolution_1),
  'Same email blind index across visitors resolves to the same Person'
);

select is(
  (
    select count(*)
    from public.person_visitor_links
    where workspace_id = '22000000-0000-0000-0000-000000000001'
      and person_id = (select person_id from identity_resolution_1)
  ),
  2::bigint,
  'One Person can own multiple visitor links'
);

create temporary table identity_email_person as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-7000-8000-000000000003',
  null,
  '2026-08-31T23:02:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'email',
      'blind_index', repeat('b', 64),
      'encrypted_value', 'aes256gcm.EEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

create temporary table identity_phone_person as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-7000-8000-000000000004',
  null,
  '2026-08-31T23:03:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'phone',
      'blind_index', repeat('c', 64),
      'encrypted_value', 'aes256gcm.GGGGGGGGGGGGGGGG.HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

create temporary table identity_conflict as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-7000-8000-000000000005',
  null,
  '2026-08-31T23:04:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'email',
      'blind_index', repeat('b', 64),
      'encrypted_value', 'aes256gcm.IIIIIIIIIIIIIIII.JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ',
      'encryption_key_version', 1
    ),
    jsonb_build_object(
      'type', 'phone',
      'blind_index', repeat('c', 64),
      'encrypted_value', 'aes256gcm.KKKKKKKKKKKKKKKK.LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

select is(
  (select resolution_status from identity_conflict),
  'IDENTITY_CONFLICT',
  'Strong identifiers mapped to different people create an identity conflict'
);

select is(
  (select person_id from identity_conflict),
  null::uuid,
  'Identity conflict does not select a Person arbitrarily'
);

create temporary table identity_workspace_b as
select *
from public.resolve_identity_v1(
  '22000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000002',
  '42000000-0000-7000-8000-000000000006',
  null,
  '2026-08-31T23:05:00Z',
  jsonb_build_array(
    jsonb_build_object(
      'type', 'email',
      'blind_index', repeat('d', 64),
      'encrypted_value', 'aes256gcm.MMMMMMMMMMMMMMMM.NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'encryption_key_version', 1
    )
  ),
  'manual_browser_identify',
  'high',
  false
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);

select is(
  (
    select count(*)
    from public.persons
    where workspace_id = '22000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'Viewer without people.view cannot list Persons'
);

select throws_ok(
  $$select count(*) from private.person_identifiers$$,
  '42501',
  'permission denied for table person_identifiers',
  'Authenticated users have no direct access to encrypted identifiers'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);

select ok(
  (
    select count(*)
    from public.persons
    where workspace_id = '22000000-0000-0000-0000-000000000001'
  ) >= 3,
  'Analyst with people.view can list Persons in their Workspace'
);

select is(
  (
    select count(*)
    from public.persons
    where workspace_id = '22000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'people.view remains isolated by Workspace'
);

select throws_ok(
  format(
    'select * from public.get_person_identifier_ciphertexts(%L::uuid, %L::uuid)',
    '22000000-0000-0000-0000-000000000001',
    (select person_id from identity_resolution_1)::text
  ),
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'people.view does not grant people.view_pii'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

select lives_ok(
  format(
    'select * from public.get_person_identifier_ciphertexts(%L::uuid, %L::uuid)',
    '22000000-0000-0000-0000-000000000001',
    (select person_id from identity_resolution_1)::text
  ),
  'Owner with people.view_pii can request encrypted PII values'
);

select throws_ok(
  format(
    'select * from public.get_person_identifier_ciphertexts(%L::uuid, %L::uuid)',
    '22000000-0000-0000-0000-000000000002',
    (select person_id from identity_workspace_b)::text
  ),
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'PII RPC rejects cross-Workspace access'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_logs
    where workspace_id = '22000000-0000-0000-0000-000000000001'
      and action = 'person.pii_viewed'
  ),
  1::bigint,
  'PII access is audit logged without storing the PII value'
);

select * from finish();
rollback;
