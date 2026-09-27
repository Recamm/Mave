begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '16000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'deletion-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '16000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'deletion-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select is(
  (
    select count(*)::integer
    from public.account_lifecycle
    where user_id = '16000000-0000-0000-0000-000000000001'
  ),
  1,
  'a private lifecycle row is created with each Auth identity'
);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.request_account_deletion() $$,
  'the owner can request account deletion'
);
select set_config(
  'test.deletion_requested_at',
  (select deletion_requested_at::text from public.account_lifecycle where user_id = auth.uid()),
  true
);
select set_config(
  'test.deletion_due_at',
  (select deletion_due_at::text from public.account_lifecycle where user_id = auth.uid()),
  true
);
select is(
  current_setting('test.deletion_due_at')::timestamptz
    - current_setting('test.deletion_requested_at')::timestamptz,
  interval '30 days',
  'the server stores a deadline exactly 30 calendar days after the request'
);
select is(
  (public.request_account_deletion()).deletion_due_at,
  current_setting('test.deletion_due_at')::timestamptz,
  'repeating a pending request does not extend its grace period'
);
select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'the owner can cancel before the stored deadline'
);
select is(
  (
    select deletion_canceled_at is not null
    from public.account_lifecycle
    where user_id = auth.uid()
  ),
  true,
  'cancellation is recorded on the owner lifecycle row'
);
select is(
  public.account_sync_allowed(),
  true,
  'sync remains allowed after cancellation'
);
select throws_ok(
  $$ select * from public.claim_expired_account_deletions(10) $$,
  '42501',
  null,
  'an authenticated account cannot claim deletion work'
);

select set_config(
  'test.deletion_category',
  (
    select id::text
    from public.categories
    where user_id = auth.uid() and name = 'Alimentación'
  ),
  true
);
select is(
  public.apply_movement_change(
    p_action := 'create',
    p_operation_id := '46000000-0000-0000-0000-000000000001',
    p_movement_id := '36000000-0000-0000-0000-000000000001',
    p_expected_version := null,
    p_payload := jsonb_build_object(
      'kind', 'expense',
      'amount', '100.00',
      'currency', 'ARS',
      'category_id', current_setting('test.deletion_category'),
      'occurred_on', '2026-09-10',
      'financial_account_id', null,
      'note', null
    )
  )->>'status',
  'applied',
  'sync remains available after a deletion request is canceled'
);
select is(
  public.apply_movement_change(
    p_action := 'update',
    p_operation_id := '46000000-0000-0000-0000-000000000002',
    p_movement_id := '36000000-0000-0000-0000-000000000001',
    p_expected_version := 9,
    p_payload := jsonb_build_object(
      'kind', 'expense',
      'amount', '125.00',
      'currency', 'ARS',
      'category_id', current_setting('test.deletion_category'),
      'occurred_on', '2026-09-10',
      'financial_account_id', null,
      'note', null
    )
  )->>'status',
  'conflict',
  'an open conflict is available to test expired resolution'
);
select set_config(
  'test.deletion_conflict_id',
  (
    select id::text
    from public.movement_conflicts
    where user_id = auth.uid() and movement_id = '36000000-0000-0000-0000-000000000001'
  ),
  true
);
select set_config(
  'test.deletion_revision_id',
  (
    select id::text
    from public.movement_conflict_revisions
    where conflict_id = current_setting('test.deletion_conflict_id')::uuid
      and source = 'client'
  ),
  true
);

select lives_ok(
  $$ select public.request_account_deletion() $$,
  'a canceled request can be started again with a new deadline'
);
select is(
  (
    select deletion_canceled_at
    from public.account_lifecycle
    where user_id = auth.uid()
  ),
  null::timestamptz,
  'a renewed request clears the previous cancellation marker'
);

reset role;
update public.account_lifecycle
set deletion_due_at = statement_timestamp() - interval '1 second'
where user_id = '16000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.account_sync_allowed(),
  false,
  'the server clock reports sync blocked at expiry before the worker runs'
);
select is(
  public.apply_movement_change(
    p_action := 'create',
    p_operation_id := '46000000-0000-0000-0000-000000000003',
    p_movement_id := '36000000-0000-0000-0000-000000000002',
    p_expected_version := null,
    p_payload := jsonb_build_object(
      'kind', 'expense',
      'amount', '200.00',
      'currency', 'ARS',
      'category_id', current_setting('test.deletion_category'),
      'occurred_on', '2026-09-11',
      'financial_account_id', null,
      'note', null
    )
  )->>'status',
  'blocked',
  'movement sync is rejected at expiry even before the worker runs'
);
select is(
  public.resolve_movement_conflict(
    p_operation_id := '47000000-0000-0000-0000-000000000001',
    p_conflict_id := current_setting('test.deletion_conflict_id')::uuid,
    p_revision_id := current_setting('test.deletion_revision_id')::uuid
  )->>'status',
  'blocked',
  'conflict resolution is also rejected at expiry'
);
select is(
  (
    select count(*)::integer
    from public.movements
    where user_id = auth.uid() and deleted_at is null
  ),
  1,
  'blocked sync creates no partial movement'
);
select is(
  (
    select amount_text
    from public.movements
    where user_id = auth.uid() and id = '36000000-0000-0000-0000-000000000001'
  ),
  '100.00',
  'blocked conflict resolution leaves the canonical movement unchanged'
);
select is(
  (
    select status
    from public.movement_conflicts
    where id = current_setting('test.deletion_conflict_id')::uuid
  ),
  'open',
  'blocked conflict resolution leaves the conflict open'
);
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  '22023',
  null,
  'an expired request cannot be canceled to reopen sync'
);

reset role;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-0000-0000-000000000001","role":"service_role"}',
  true
);
set local role service_role;

select set_config(
  'test.claimed_user_id',
  (select user_id::text from public.claim_expired_account_deletions(10)),
  true
);
select is(
  current_setting('test.claimed_user_id'),
  '16000000-0000-0000-0000-000000000001',
  'the worker claims only the expired account'
);
select is(
  (select count(*)::integer from public.claim_expired_account_deletions(10)),
  0,
  'an active worker lease prevents duplicate claims'
);
select is(
  (
    select deletion_started_at is not null
      and deletion_worker_lease_until > statement_timestamp()
    from public.account_lifecycle
    where user_id = '16000000-0000-0000-0000-000000000001'
  ),
  true,
  'claiming records worker start and a bounded lease'
);
select lives_ok(
  $$ select public.release_expired_account_deletion_claim('16000000-0000-0000-0000-000000000001') $$,
  'the worker can release a failed claim for retry'
);
select is(
  (
    select user_id::text
    from public.claim_expired_account_deletions(10)
  ),
  '16000000-0000-0000-0000-000000000001',
  'an expired account can be reclaimed after a failed attempt'
);

reset role;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.account_sync_allowed(),
  true,
  'an expired request does not block a different owner'
);
select is(
  (select count(*)::integer from public.account_lifecycle
   where user_id = '16000000-0000-0000-0000-000000000001'),
  0,
  'another owner cannot read a lifecycle row'
);
select is(
  (select count(*)::integer from public.account_lifecycle),
  1,
  'the owner sees only their own lifecycle row'
);
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  '22023',
  null,
  'an owner cannot cancel a request that was never made in their account'
);

select * from finish();
rollback;