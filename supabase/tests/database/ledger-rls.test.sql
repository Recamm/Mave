begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

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
select lives_ok(
  $$
    insert into public.movements (
      id,
      kind,
      amount,
      currency,
      category_id,
      occurred_on
    )
    values (
      '30000000-0000-0000-0000-000000000001',
      'expense',
      1250.50,
      'ARS',
      current_setting('test.owner_one_category')::uuid,
      date '2026-09-26'
    )
  $$,
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
select lives_ok(
  $$
    update public.movements
    set note = 'unauthorized update'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'owner two cannot update a hidden movement'
);
select throws_ok(
  $$
    insert into public.movements (
      kind,
      amount,
      currency,
      category_id,
      occurred_on
    )
    values (
      'expense',
      1.00,
      'ARS',
      current_setting('test.owner_one_category')::uuid,
      date '2026-09-26'
    )
  $$,
  '23514',
  'owner two cannot reference owner one category'
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