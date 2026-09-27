begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '15000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'goal-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '15000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'goal-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.goals (id, name, target_amount, currency, target_date)
    values (
      '25000000-0000-0000-0000-000000000001',
      'Viaje',
      50000.00,
      'ARS',
      null
    )
  $$,
  'owner can create a savings goal with an optional target date'
);
select is(
  (
    select target_amount_text
    from public.goals
    where id = '25000000-0000-0000-0000-000000000001'
  ),
  '50000.00',
  'goal target preserves its exact decimal text'
);
select is(
  (
    select currency
    from public.goals
    where id = '25000000-0000-0000-0000-000000000001'
  ),
  'ARS',
  'goal stores its own currency'
);
select is(
  (
    select target_date::text
    from public.goals
    where id = '25000000-0000-0000-0000-000000000001'
  ),
  null,
  'goal target date may be omitted'
);
select lives_ok(
  $$
    insert into public.goals (id, name, target_amount, currency, target_date)
    values (
      '25000000-0000-0000-0000-000000000002',
      'Fondo USD',
      250.50,
      'USD',
      date '2026-12-31'
    )
  $$,
  'owner can create a USD goal with a target date'
);
select is(
  (
    select currency || ':' || target_date::text
    from public.goals
    where id = '25000000-0000-0000-0000-000000000002'
  ),
  'USD:2026-12-31',
  'goal keeps the selected currency and date'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'goal_contributions'
      and column_name = 'currency'
  ),
  0,
  'contribution currency is inherited from its goal'
);

select lives_ok(
  $$
    insert into public.goal_contributions (id, goal_id, amount, contributed_on)
    values (
      '35000000-0000-0000-0000-000000000001',
      '25000000-0000-0000-0000-000000000001',
      1200.50,
      date '2026-09-26'
    )
  $$,
  'owner can add a positive contribution to their goal'
);
select is(
  (
    select amount_text
    from public.goal_contributions
    where id = '35000000-0000-0000-0000-000000000001'
  ),
  '1200.50',
  'contribution preserves its exact decimal text'
);
select is(
  (
    select goal_id::text
    from public.goal_contributions
    where id = '35000000-0000-0000-0000-000000000001'
  ),
  '25000000-0000-0000-0000-000000000001',
  'contribution remains linked to its goal'
);
select throws_ok(
  $$
    insert into public.goals (name, target_amount, currency)
    values ('Objetivo cero', 0, 'ARS')
  $$,
  '23514',
  null,
  'zero target amounts are rejected'
);
select throws_ok(
  $$
    insert into public.goals (name, target_amount, currency)
    values ('Objetivo negativo', -1, 'ARS')
  $$,
  '23514',
  null,
  'negative target amounts are rejected'
);
select throws_ok(
  $$
    insert into public.goals (name, target_amount, currency)
    values ('Objetivo inválido', 1, 'EUR')
  $$,
  '23514',
  null,
  'unsupported goal currencies are rejected'
);
select throws_ok(
  $$
    insert into public.goal_contributions (goal_id, amount, contributed_on)
    values ('25000000-0000-0000-0000-000000000001', 0, date '2026-09-26')
  $$,
  '23514',
  null,
  'zero contributions are rejected'
);
select throws_ok(
  $$
    insert into public.goal_contributions (goal_id, amount, contributed_on)
    values ('25000000-0000-0000-0000-000000000001', -1, date '2026-09-26')
  $$,
  '23514',
  null,
  'negative contributions are rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
insert into public.goals (id, name, target_amount, currency)
values (
  '25000000-0000-0000-0000-000000000003',
  'Meta privada',
  10.00,
  'ARS'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.goal_contributions (goal_id, amount, contributed_on)
    values ('25000000-0000-0000-0000-000000000003', 1, date '2026-09-26')
  $$,
  '23503',
  null,
  'a contribution cannot reference another owner goal'
);
select is(
  (select count(*)::integer from public.goal_contributions),
  1,
  'rejected contributions leave no partial rows'
);
select is(
  (select count(*)::integer from public.financial_accounts),
  0,
  'goal contributions do not create or change financial accounts'
);
select is(
  (select count(*)::integer from public.movements),
  0,
  'goal contributions do not create movements'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.goals),
  1,
  'another owner sees only their own goal'
);
select is(
  (select count(*)::integer from public.goal_contributions),
  0,
  'another owner cannot read a contribution'
);
select lives_ok(
  $$ delete from public.goals where id = '25000000-0000-0000-0000-000000000001' $$,
  'another owner cannot delete someone else''s goal'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.goals where id = '25000000-0000-0000-0000-000000000001'),
  1,
  'a foreign delete leaves the owner’s goal intact'
);
select lives_ok(
  $$ delete from public.goals where id = '25000000-0000-0000-0000-000000000001' $$,
  'owner can delete their own goal'
);
select is(
  (select count(*)::integer from public.goals where user_id = auth.uid()),
  1,
  'deleting one goal leaves the owner’s other goal intact'
);
select is(
  (select count(*)::integer from public.goal_contributions),
  0,
  'deleting a goal cascades to its contributions'
);

reset role;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.goals where id = '25000000-0000-0000-0000-000000000003'),
  1,
  'deleting another owner’s goal does not affect this owner’s goal'
);

select * from finish();
rollback;