begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

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
  ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pixel-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pixel-owner-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pixel-viewer-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'pixel-analyst-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pixel-admin-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('11000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'pixel-multi@example.test', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, slug, created_by)
values
  ('21000000-0000-0000-0000-000000000001', 'Pixel Workspace A', 'pixel-workspace-a', '11000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000002', 'Pixel Workspace B', 'pixel-workspace-b', '11000000-0000-0000-0000-000000000002'),
  ('21000000-0000-0000-0000-000000000003', 'Pixel Workspace C', 'pixel-workspace-c', '11000000-0000-0000-0000-000000000006');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'owner'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'viewer'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000004', 'analyst'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000005', 'admin'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000006', 'viewer'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'owner'),
  ('21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000006', 'viewer');

insert into public.pixels (
  id,
  workspace_id,
  name,
  public_key,
  created_by
)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'Pixel A',
    'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '11000000-0000-0000-0000-000000000001'
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'Pixel B',
    'px_pub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '11000000-0000-0000-0000-000000000002'
  ),
  (
    '31000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000003',
    'Pixel C',
    'px_pub_cccccccccccccccccccccccccccccccccccc',
    '11000000-0000-0000-0000-000000000006'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.pixels where workspace_id = '21000000-0000-0000-0000-000000000002'),
  0::bigint,
  'Workspace A user cannot list Pixels from Workspace B'
);

select is(
  (select count(*) from public.pixels where id = '31000000-0000-0000-0000-000000000002'),
  0::bigint,
  'Workspace A user cannot open Pixel B by manipulating pixelId'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.create_pixel(
      '21000000-0000-0000-0000-000000000001',
      'Viewer Pixel',
      null,
      false
    )$$,
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'Viewer cannot create Pixel'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.update_pixel(
      '31000000-0000-0000-0000-000000000001',
      'Analyst mutation'
    )$$,
  'P0001',
  'PIXEL_ACCESS_DENIED',
  'Analyst cannot edit Pixel'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select * from public.create_pixel(
      '21000000-0000-0000-0000-000000000001',
      'Admin Pixel',
      null,
      false
    )$$,
  'Admin can create Pixel'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.add_pixel_domain(
      '31000000-0000-0000-0000-000000000002',
      'checkout.example.com',
      false
    )$$,
  'P0001',
  'PIXEL_ACCESS_DENIED',
  'User cannot add a domain to a Pixel from another Workspace'
);

select lives_ok(
  $$select public.add_pixel_domain(
      '31000000-0000-0000-0000-000000000001',
      'example.com',
      false
    )$$,
  'Authorized user can add a normalized domain'
);

select throws_ok(
  $$select public.add_pixel_domain(
      '31000000-0000-0000-0000-000000000001',
      'example.com',
      false
    )$$,
  'P0001',
  'DOMAIN_DUPLICATE',
  'Duplicate domain in the same Pixel is rejected'
);

select lives_ok(
  $$select public.set_pixel_status(
      '31000000-0000-0000-0000-000000000001',
      'archived'
    )$$,
  'Pixel can be archived without hard delete'
);

reset role;
select is(
  (
    select count(*)
    from public.pixels
    where id = '31000000-0000-0000-0000-000000000001'
      and status = 'archived'
  ),
  1::bigint,
  'Archiving a Pixel keeps the record'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000006', true);
select is(
  (
    select count(*)
    from public.pixels
    where workspace_id = '21000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'Workspace-filtered Pixel query only returns the selected Workspace'
);

select is(
  (
    select count(*)
    from public.pixels
    where workspace_id = '21000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'Switching Workspace does not leak Pixels from another selected tenant'
);

select * from finish();
rollback;
