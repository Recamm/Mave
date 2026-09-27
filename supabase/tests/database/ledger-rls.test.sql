begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'ledger-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'ledger-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select set_config('test.owner_one_category', (
  select id::text
  from public.categories
  where user_id = '10000000-0000-0000-0000-000000000001'
    and name = 'Alimentación'
), true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.categories),
  10,
  'owner one receives a private default category catalog'
);
select lives_ok(
  $$
    insert into public.financial_accounts (id, name, kind, currency)
    values (
      '20000000-0000-0000-0000-000000000001',
      'Efectivo',
      'cash',
      'ARS'
    )
  $$,
  'owner one can create a financial account'
);
select throws_ok(
  $$
    insert into public.financial_accounts (name, kind, currency, opening_balance)
    values ('Saldo NaN', 'cash', 'ARS', 'NaN'::numeric)
  $$,
  '23514',
  null,
  'a NaN opening balance is rejected'
);
select throws_ok(
  $$
    insert into public.financial_accounts (name, kind, currency, opening_balance)
    values ('Saldo infinito', 'cash', 'ARS', 'Infinity'::numeric)
  $$,
  '23514',
  null,
  'an infinite opening balance is rejected'
);
select is(
  $$
    select public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '40000000-0000-0000-0000-000000000001',
      p_movement_id := '30000000-0000-0000-0000-000000000001',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '1250.50',
        'currency', 'ARS',
        'category_id', current_setting('test.owner_one_category'),
        'occurred_on', '2026-09-26',
        'financial_account_id', null,
        'note', null
      )
    )->'movement'->>'id'
  $$,
  '30000000-0000-0000-0000-000000000001',
  'owner one can create a movement in their own category'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.categories),
  10,
  'owner two receives a separate default category catalog'
);
select is(
  (
    select count(*)::integer
    from public.categories
    where id = current_setting('test.owner_one_category')::uuid
  ),
  0,
  'owner two cannot read owner one categories'
);
select is(
  (select count(*)::integer from public.financial_accounts),
  0,
  'owner two cannot read owner one financial accounts'
);
select is(
  (select count(*)::integer from public.movements),
  0,
  'owner two cannot read owner one movements'
);
select throws_ok(
  $$
    update public.movements
    set note = 'unauthorized update'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'owner two cannot write movements outside the sync transaction'
);
select throws_ok(
  $$
    select public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '40000000-0000-0000-0000-000000000002',
      p_movement_id := '30000000-0000-0000-0000-000000000002',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '1.00',
        'currency', 'ARS',
        'category_id', current_setting('test.owner_one_category'),
        'occurred_on', '2026-09-26',
        'financial_account_id', null,
        'note', null
      )
    )
  $$,
  '23514',
  'Movement category is unavailable for new assignments.',
  'owner two cannot reference owner one category through sync'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select note
    from public.movements
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  null::text,
  'owner two update leaves owner one movement unchanged'
);

select * from finish();
rollback;