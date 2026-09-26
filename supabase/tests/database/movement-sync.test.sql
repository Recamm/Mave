begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '12000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'sync-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '12000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'sync-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select set_config('test.sync_category', (
  select id::text
  from public.categories
  where user_id = '12000000-0000-0000-0000-000000000001'
    and name = 'Alimentación'
), true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '42000000-0000-0000-0000-000000000001',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '100.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )->>'status'
  ),
  'applied',
  'owner can create a movement through the sync transaction'
);
select is(
  (
    public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '42000000-0000-0000-0000-000000000001',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '100.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )->'movement'->>'id'
  ),
  '32000000-0000-0000-0000-000000000001',
  'retrying a create returns its original movement'
);
select is(
  (
    select count(*)::integer
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  1,
  'retrying the same operation does not duplicate the movement'
);
select throws_ok(
  $$
    select public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '42000000-0000-0000-0000-000000000001',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '101.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )
  $$,
  '22023',
  null,
  'an operation id cannot be reused with different data'
);

select is(
  (
    public.apply_movement_change(
      p_action := 'update',
      p_operation_id := '42000000-0000-0000-0000-000000000002',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := 1,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '125.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )->>'status'
  ),
  'applied',
  'an update applies when its expected version is current'
);
select is(
  (
    select version
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  2,
  'an applied update increments the canonical version'
);
select throws_ok(
  $$
    update public.movements
    set amount = 130.00
    where id = '32000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'direct movement writes are denied in favor of the sync transaction'
);

select is(
  (
    public.apply_movement_change(
      p_action := 'update',
      p_operation_id := '42000000-0000-0000-0000-000000000003',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := 1,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '175.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', 'Cambio desde otro dispositivo'
      )
    )->>'status'
  ),
  'conflict',
  'a stale update opens a conflict instead of overwriting canonical data'
);
select set_config('test.sync_conflict_id', (
  select id::text
  from public.movement_conflicts
  where movement_id = '32000000-0000-0000-0000-000000000001'
    and status = 'open'
), true);
select set_config('test.sync_client_revision_id', (
  select id::text
  from public.movement_conflict_revisions
  where conflict_id = current_setting('test.sync_conflict_id')::uuid
    and source = 'client'
), true);
select is(
  (
    select count(*)::integer
    from public.movement_conflicts
    where id = current_setting('test.sync_conflict_id')::uuid
      and status = 'open'
  ),
  1,
  'the incompatible change is represented by one open conflict'
);
select is(
  (
    select count(*)::integer
    from public.movement_conflict_revisions
    where conflict_id = current_setting('test.sync_conflict_id')::uuid
  ),
  2,
  'the conflict preserves canonical and client snapshots'
);
select is(
  (
    select count(*)::integer
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
      and deleted_at is null
  ),
  1,
  'an open conflict still contributes only one canonical movement'
);
select throws_ok(
  $$
    update public.movement_conflict_revisions
    set note = 'snapshot mutation'
    where id = current_setting('test.sync_client_revision_id')::uuid
  $$,
  '42501',
  null,
  'authenticated users cannot modify preserved snapshots'
);

select is(
  (
    public.resolve_movement_conflict(
      p_operation_id := '43000000-0000-0000-0000-000000000001',
      p_conflict_id := current_setting('test.sync_conflict_id')::uuid,
      p_revision_id := current_setting('test.sync_client_revision_id')::uuid
    )->>'status'
  ),
  'resolved',
  'owner can resolve a conflict by choosing a preserved revision'
);
select is(
  (
    select amount_text
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  '175.00',
  'the selected client snapshot becomes canonical'
);
select is(
  (
    select version
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  3,
  'resolving the conflict advances the canonical version once'
);
select is(
  (
    select status
    from public.movement_conflicts
    where id = current_setting('test.sync_conflict_id')::uuid
  ),
  'resolved',
  'resolution closes the conflict'
);
select is(
  (
    select chosen_revision_id::text
    from public.movement_conflicts
    where id = current_setting('test.sync_conflict_id')::uuid
  ),
  current_setting('test.sync_client_revision_id'),
  'resolution records the chosen snapshot'
);
select is(
  (
    public.resolve_movement_conflict(
      p_operation_id := '43000000-0000-0000-0000-000000000001',
      p_conflict_id := current_setting('test.sync_conflict_id')::uuid,
      p_revision_id := current_setting('test.sync_client_revision_id')::uuid
    )->>'status'
  ),
  'resolved',
  'retrying a resolution returns its original result'
);
select is(
  (
    select version
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  3,
  'retrying a resolution does not apply the snapshot twice'
);
select throws_ok(
  $$
    select public.resolve_movement_conflict(
      p_operation_id := '43000000-0000-0000-0000-000000000001',
      p_conflict_id := current_setting('test.sync_conflict_id')::uuid,
      p_revision_id := (
        select id
        from public.movement_conflict_revisions
        where conflict_id = current_setting('test.sync_conflict_id')::uuid
          and source = 'server'
      )
    )
  $$,
  '22023',
  null,
  'a resolution id cannot be reused with a different choice'
);

reset role;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.movements
    where id = '32000000-0000-0000-0000-000000000001'
  ),
  0,
  'another owner cannot read the canonical movement'
);
select is(
  (select count(*)::integer from public.movement_conflicts),
  0,
  'another owner cannot read the conflict'
);
select is(
  (select count(*)::integer from public.movement_conflict_revisions),
  0,
  'another owner cannot read conflict snapshots'
);
select throws_ok(
  $$
    select public.apply_movement_change(
      p_action := 'update',
      p_operation_id := '42000000-0000-0000-0000-000000000004',
      p_movement_id := '32000000-0000-0000-0000-000000000001',
      p_expected_version := 3,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '200.00',
        'currency', 'ARS',
        'category_id', current_setting('test.sync_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )
  $$,
  '42501',
  null,
  'another owner cannot update a hidden movement'
);
select throws_ok(
  $$
    select public.resolve_movement_conflict(
      p_operation_id := '43000000-0000-0000-0000-000000000002',
      p_conflict_id := current_setting('test.sync_conflict_id')::uuid,
      p_revision_id := current_setting('test.sync_client_revision_id')::uuid
    )
  $$,
  '42501',
  null,
  'another owner cannot resolve a hidden conflict'
);

select * from finish();
rollback;