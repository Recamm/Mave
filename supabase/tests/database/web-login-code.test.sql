begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '71000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'code-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'code-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

insert into public.web_login_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
values (
  '71000000-0000-0000-0000-000000000001',
  'https://fcm.googleapis.com/fcm/send/test-subscription',
  repeat('A', 87),
  repeat('B', 22)
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.find_web_login_user_id(' CODE-OWNER-ONE@example.invalid'),
  '71000000-0000-0000-0000-000000000001'::uuid,
  'confirmed emails resolve case-insensitively to one account'
);
select is(
  public.find_web_login_user_id('unknown@example.invalid'),
  null::uuid,
  'unknown emails do not resolve to an account'
);

select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      repeat('a', 64),
      repeat('b', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  '71000000-0000-0000-0000-000000000001'::uuid,
  'first code request can notify its account'
);
select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000002',
      '71000000-0000-0000-0000-000000000001',
      repeat('c', 64),
      repeat('d', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  '71000000-0000-0000-0000-000000000001'::uuid,
  'second code request can notify its account'
);
select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000003',
      '71000000-0000-0000-0000-000000000001',
      repeat('e', 64),
      repeat('f', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  '71000000-0000-0000-0000-000000000001'::uuid,
  'third code request can notify its account'
);
select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000004',
      '71000000-0000-0000-0000-000000000001',
      repeat('0', 64),
      repeat('1', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  null::uuid,
  'fourth code request in ten minutes is not delivered'
);
select is(
  (
    select target_user_id
    from public.web_login_challenges
    where id = '72000000-0000-0000-0000-000000000004'
  ),
  null::uuid,
  'rate-limited requests do not retain an account target'
);

select is(
  public.approve_web_login_challenge(
    '72000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    '71000000-0000-0000-0000-000000000001',
    'code-owner-one@example.invalid',
    repeat('2', 64)
  ),
  false,
  'QR approval RPC cannot approve a six-digit challenge'
);
select is(
  public.approve_web_login_code_challenge(
    '72000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    '71000000-0000-0000-0000-000000000002',
    'code-owner-two@example.invalid',
    repeat('3', 64)
  ),
  false,
  'a different account cannot approve the challenge'
);
select is(
  public.approve_web_login_code_challenge(
    '72000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    '71000000-0000-0000-0000-000000000001',
    'code-owner-one@example.invalid',
    repeat('4', 64)
  ),
  true,
  'the targeted account can approve the matching code hash'
);
select is(
  public.approve_web_login_code_challenge(
    '72000000-0000-0000-0000-000000000001',
    repeat('a', 64),
    '71000000-0000-0000-0000-000000000001',
    'code-owner-one@example.invalid',
    repeat('5', 64)
  ),
  false,
  'approved challenges cannot be replayed'
);
select is(
  (
    select account_email || ':' || magic_link_token_hash
    from public.consume_web_login_challenge(
      '72000000-0000-0000-0000-000000000001',
      repeat('b', 64)
    )
  ),
  'code-owner-one@example.invalid:' || repeat('4', 64),
  'the PC receives the one-time token after approval'
);
select is(
  (
    select count(*)::integer
    from public.consume_web_login_challenge(
      '72000000-0000-0000-0000-000000000001',
      repeat('b', 64)
    )
  ),
  0,
  'the PC token can only be consumed once'
);

select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000005',
      '71000000-0000-0000-0000-000000000002',
      repeat('6', 64),
      repeat('7', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  '71000000-0000-0000-0000-000000000002'::uuid,
  'another account can create its own challenge'
);
select is(public.record_web_login_code_failure(
  '72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000002'
), 1, 'first invalid code consumes one attempt');
select is(public.record_web_login_code_failure(
  '72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000002'
), 2, 'second invalid code consumes one attempt');
select is(public.record_web_login_code_failure(
  '72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000002'
), 3, 'third invalid code consumes one attempt');
select is(public.record_web_login_code_failure(
  '72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000002'
), 4, 'fourth invalid code consumes one attempt');
select is(public.record_web_login_code_failure(
  '72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000002'
), 5, 'fifth invalid code locks the challenge');
select is(
  public.record_web_login_code_failure(
    '72000000-0000-0000-0000-000000000005',
    '71000000-0000-0000-0000-000000000002'
  ),
  null::integer,
  'locked challenges reject further attempts'
);
select is(
  (select status from public.web_login_challenges where id = '72000000-0000-0000-0000-000000000005'),
  'consumed',
  'lockout consumes the pending challenge'
);

select is(
  (
    select notification_user_id
    from public.create_web_login_code_challenge(
      '72000000-0000-0000-0000-000000000006',
      '71000000-0000-0000-0000-000000000002',
      repeat('8', 64),
      repeat('9', 64),
      'desktop.example.invalid',
      statement_timestamp() + interval '3 minutes'
    )
  ),
  '71000000-0000-0000-0000-000000000002'::uuid,
  'a pending request can be created for rejection testing'
);
select is(
  public.reject_web_login_code_challenge(
    '72000000-0000-0000-0000-000000000006',
    '71000000-0000-0000-0000-000000000002'
  ),
  true,
  'the targeted account can reject a pending login'
);
select is(
  public.reject_web_login_code_challenge(
    '72000000-0000-0000-0000-000000000006',
    '71000000-0000-0000-0000-000000000002'
  ),
  false,
  'rejected requests cannot be replayed'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.web_login_push_subscriptions$$,
  '42501',
  null,
  'authenticated users cannot read push subscriptions'
);
select throws_ok(
  $$
    insert into public.web_login_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
    values (
      '71000000-0000-0000-0000-000000000001',
      'https://fcm.googleapis.com/fcm/send/forbidden',
      repeat('C', 87),
      repeat('D', 22)
    )
  $$,
  '42501',
  null,
  'authenticated users cannot write push subscriptions directly'
);
select throws_ok(
  $$select public.find_web_login_user_id('code-owner-one@example.invalid')$$,
  '42501',
  null,
  'authenticated users cannot enumerate login accounts'
);

select * from finish();
rollback;