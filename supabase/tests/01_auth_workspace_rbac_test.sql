begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'member-c@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'admin-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'analyst-a@example.test', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, slug, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'Workspace A', 'workspace-a', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Workspace B', 'workspace-b', '10000000-0000-0000-0000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'analyst'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.workspaces where id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  'A cannot read Workspace B'
);

select is(
  (select count(*) from public.workspace_members where workspace_id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  'A cannot read memberships from Workspace B'
);

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    values (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'viewer'
    )$$,
  '42501',
  'permission denied for table workspace_members',
  'A cannot insert arbitrary membership'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
update public.workspaces
set name = 'Viewer mutation'
where id = '20000000-0000-0000-0000-000000000001';

reset role;
select is(
  (select name from public.workspaces where id = '20000000-0000-0000-0000-000000000001'),
  'Workspace A',
  'Viewer cannot update Workspace'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.create_workspace_invitation(
      '20000000-0000-0000-0000-000000000001',
      'new-user@example.test',
      'viewer',
      repeat('a', 64),
      now() + interval '7 days'
    )$$,
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'Analyst cannot invite a member'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.change_workspace_member_role(
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000005',
      'owner'
    )$$,
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'Admin cannot promote a member to Owner'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.change_workspace_member_role(
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'admin'
    )$$,
  'P0001',
  'LAST_OWNER_PROTECTION',
  'Last Owner cannot be demoted'
);

select public.create_workspace_invitation(
  '20000000-0000-0000-0000-000000000001',
  'member-c@example.test',
  'viewer',
  repeat('b', 64),
  now() + interval '7 days'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select public.accept_workspace_invitation(repeat('b', 64));

reset role;
select is(
  (
    select count(*)
    from public.workspace_members
    where workspace_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'Valid invitation creates exactly one membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.accept_workspace_invitation(repeat('b', 64))$$,
  'P0001',
  'INVITATION_ALREADY_USED',
  'Invitation cannot be accepted twice'
);

select * from finish();
rollback;
