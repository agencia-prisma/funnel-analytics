begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
  ('15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'funnel-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'funnel-owner-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'funnel-viewer-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'funnel-analyst-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('15000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'funnel-admin-a@example.test', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, slug, created_by)
values
  ('25000000-0000-0000-0000-000000000001', 'Funnel Workspace A', 'funnel-workspace-a', '15000000-0000-0000-0000-000000000001'),
  ('25000000-0000-0000-0000-000000000002', 'Funnel Workspace B', 'funnel-workspace-b', '15000000-0000-0000-0000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'owner'),
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000003', 'viewer'),
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000004', 'analyst'),
  ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000005', 'admin'),
  ('25000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      'Primary Funnel',
      'Landing to checkout',
      2592000,
      '[
        {
          "step_key":"landing",
          "name":"Landing",
          "rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}
        },
        {
          "step_key":"checkout",
          "name":"Checkout",
          "rule":{"kind":"condition","field":"custom_event_name","operator":"equals","value":"checkout_started"}
        }
      ]'::jsonb
    )
  $test$,
  'Owner can create an ordered versioned funnel'
);

select is(
  (
    select fv.version
    from public.funnels f
    join public.funnel_versions fv on fv.id = f.current_version_id
    where f.workspace_id = '25000000-0000-0000-0000-000000000001'
      and f.name = 'Primary Funnel'
  ),
  1,
  'New funnel activates version 1'
);

select is(
  (
    select count(*)
    from public.funnel_steps fs
    join public.funnels f on f.id = fs.funnel_id
    where f.workspace_id = '25000000-0000-0000-0000-000000000001'
      and f.name = 'Primary Funnel'
  ),
  2::bigint,
  'Version 1 stores exactly two ordered steps'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);

select is(
  (
    select count(*)
    from public.funnels
    where workspace_id = '25000000-0000-0000-0000-000000000001'
      and name = 'Primary Funnel'
  ),
  1::bigint,
  'Viewer can read funnels in their Workspace'
);

select throws_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      'Viewer Funnel',
      null,
      3600,
      '[
        {"step_key":"one","name":"One","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/one"}},
        {"step_key":"two","name":"Two","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/two"}}
      ]'::jsonb
    )
  $test$,
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'Viewer cannot create funnels'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000004', true);

select is(
  (
    select count(*)
    from public.funnels
    where workspace_id = '25000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'Analyst can read funnels'
);

select throws_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      'Analyst Funnel',
      null,
      3600,
      '[
        {"step_key":"one","name":"One","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/one"}},
        {"step_key":"two","name":"Two","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/two"}}
      ]'::jsonb
    )
  $test$,
  'P0001',
  'INSUFFICIENT_PERMISSION',
  'Analyst cannot mutate funnels'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000005', true);

select lives_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      'Admin Funnel',
      null,
      7200,
      '[
        {"step_key":"visit","name":"Visit","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}},
        {"step_key":"lead","name":"Lead","rule":{"kind":"condition","field":"event_name","operator":"equals","value":"lead"}}
      ]'::jsonb
    )
  $test$,
  'Admin can create funnels'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000002',
      'Workspace B Funnel',
      null,
      3600,
      '[
        {"step_key":"visit","name":"Visit","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}},
        {"step_key":"purchase","name":"Purchase","rule":{"kind":"condition","field":"event_name","operator":"equals","value":"purchase"}}
      ]'::jsonb
    )
  $test$,
  'Workspace B owner can create its own funnel'
);

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);

select is(
  (
    select count(*)
    from public.funnels
    where workspace_id = '25000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'Workspace A owner cannot list Workspace B funnels'
);

select lives_ok(
  $test$
    select * from public.create_funnel_version_v1(
      '25000000-0000-0000-0000-000000000001',
      (select id from public.funnels where name = 'Primary Funnel'),
      1,
      604800,
      '[
        {"step_key":"landing","name":"Landing","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}},
        {"step_key":"lead","name":"Lead","rule":{"kind":"condition","field":"custom_event_name","operator":"equals","value":"lead_captured"}},
        {"step_key":"checkout","name":"Checkout","rule":{"kind":"condition","field":"custom_event_name","operator":"equals","value":"checkout_started"}}
      ]'::jsonb
    )
  $test$,
  'Owner can publish version 2 using the expected current version'
);

select is(
  (
    select fv.version
    from public.funnels f
    join public.funnel_versions fv on fv.id = f.current_version_id
    where f.name = 'Primary Funnel'
  ),
  2,
  'Current version advances atomically to version 2'
);

select is(
  (
    select count(*)
    from public.funnel_versions fv
    join public.funnels f on f.id = fv.funnel_id
    where f.name = 'Primary Funnel'
  ),
  2::bigint,
  'Previous funnel version remains persisted'
);

select throws_ok(
  $test$
    select * from public.create_funnel_version_v1(
      '25000000-0000-0000-0000-000000000001',
      (select id from public.funnels where name = 'Primary Funnel'),
      1,
      604800,
      '[
        {"step_key":"landing","name":"Landing","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}},
        {"step_key":"checkout","name":"Checkout","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/checkout"}}
      ]'::jsonb
    )
  $test$,
  'P0001',
  'FUNNEL_VERSION_CONFLICT',
  'Stale editor cannot overwrite a newer funnel definition'
);

select throws_ok(
  $test$
    update public.funnel_versions
    set conversion_window_seconds = 60
    where funnel_id = (select id from public.funnels where name = 'Primary Funnel')
  $test$,
  '42501',
  'permission denied for table funnel_versions',
  'Authenticated users cannot mutate immutable version rows directly'
);

select throws_ok(
  $test$
    select * from public.create_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      'Duplicate Steps',
      null,
      3600,
      '[
        {"step_key":"same","name":"One","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/one"}},
        {"step_key":"same","name":"Two","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/two"}}
      ]'::jsonb
    )
  $test$,
  'P0001',
  'FUNNEL_STEP_KEY_DUPLICATE',
  'Duplicate step keys are rejected at the control plane boundary'
);

select lives_ok(
  $test$
    select public.archive_funnel_v1(
      '25000000-0000-0000-0000-000000000001',
      (select id from public.funnels where name = 'Primary Funnel')
    )
  $test$,
  'Funnel can be archived without deleting historical versions'
);

select throws_ok(
  $test$
    select * from public.create_funnel_version_v1(
      '25000000-0000-0000-0000-000000000001',
      (select id from public.funnels where name = 'Primary Funnel'),
      2,
      604800,
      '[
        {"step_key":"landing","name":"Landing","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/"}},
        {"step_key":"checkout","name":"Checkout","rule":{"kind":"condition","field":"page_path","operator":"equals","value":"/checkout"}}
      ]'::jsonb
    )
  $test$,
  'P0001',
  'FUNNEL_ARCHIVED',
  'Archived funnels reject new versions'
);

select * from finish();
rollback;
