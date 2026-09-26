begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '11000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'refund-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'refund-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select set_config('test.refund_food_category', (
  select id::text
  from public.categories
  where user_id = '11000000-0000-0000-0000-000000000001'
    and name = 'Alimentación'
), true);
select set_config('test.refund_income_category', (
  select id::text
  from public.categories
  where user_id = '11000000-0000-0000-0000-000000000001'
    and name = 'Ingresos'
), true);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.financial_accounts (id, name, kind, currency)
values (
  '21000000-0000-0000-0000-000000000001',
  'Cuenta ARS',
  'bank',
  'ARS'
);

select is(
  $$
    select public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000010',
      p_movement_id := '31000000-0000-0000-0000-000000000001',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'expense',
        'amount', '100.00',
        'currency', 'ARS',
        'category_id', current_setting('test.refund_food_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', '21000000-0000-0000-0000-000000000001',
        'note', null
      )
    )->'movement'->>'id'
  $$,
  '31000000-0000-0000-0000-000000000001',
  'owner can create the expense that receives a refund'
);
select is(
  $$
    select public.apply_movement_change(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000011',
      p_movement_id := '31000000-0000-0000-0000-000000000002',
      p_expected_version := null,
      p_payload := jsonb_build_object(
        'kind', 'income',
        'amount', '100.00',
        'currency', 'ARS',
        'category_id', current_setting('test.refund_income_category'),
        'occurred_on', '2026-09-10',
        'financial_account_id', null,
        'note', null
      )
    )->'movement'->>'id'
  $$,
  '31000000-0000-0000-0000-000000000002',
  'owner can create an income used to verify refund parent type'
);

select lives_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000001',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 60.00,
      p_received_on := date '2026-09-20',
      p_expected_version := null
    )
  $$,
  'owner can record a partial refund for their own expense'
);
select is(
  (
    select refund.id::text
    from public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000001',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 60.00,
      p_received_on := date '2026-09-20',
      p_expected_version := null
    ) as refund
  ),
  (
    select id::text
    from public.refunds
    where client_operation_id = '41000000-0000-0000-0000-000000000001'
  ),
  'retrying the same operation returns the original refund'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000001',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 59.00,
      p_received_on := date '2026-09-20',
      p_expected_version := null
    )
  $$,
  '22023',
  'Operation id has already been used for a different refund request.',
  'an operation id cannot be reused for different parameters'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := null,
      p_operation_id := '41000000-0000-0000-0000-000000000006',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 1.00,
      p_received_on := date '2026-09-20',
      p_expected_version := null
    )
  $$,
  '22023',
  'Refund action is invalid.',
  'a null refund action is rejected'
);
select is(
  (
    select count(*)::integer
    from public.refunds r
    join public.movements m
      on m.user_id = r.user_id and m.id = r.expense_id
    where r.client_operation_id = '41000000-0000-0000-0000-000000000001'
      and r.amount_text = '60.00'
      and m.kind = 'expense'
      and m.currency = 'ARS'
      and m.category_id = current_setting('test.refund_food_category')::uuid
      and m.financial_account_id = '21000000-0000-0000-0000-000000000001'
  ),
  1,
  'refund inherits currency, category, and account from its expense'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000002',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 0,
      p_received_on := date '2026-09-21',
      p_expected_version := null
    )
  $$,
  '23514',
  'Refund amount must be positive and have at most two decimal places.',
  'zero refund is rejected'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000003',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 40.01,
      p_received_on := date '2026-09-22',
      p_expected_version := null
    )
  $$,
  '23514',
  'Refunds cannot exceed the remaining expense amount.',
  'refund total cannot exceed the original expense'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000004',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000002',
      p_amount := 1.00,
      p_received_on := date '2026-09-22',
      p_expected_version := null
    )
  $$,
  '23514',
  'Refund parent must be an active expense owned by the caller.',
  'refund cannot target an income'
);
select throws_ok(
  $$
    insert into public.refunds (expense_id, amount, received_on)
    values (
      '31000000-0000-0000-0000-000000000001',
      1.00,
      date '2026-09-22'
    )
  $$,
  '42501',
  null,
  'direct table writes are denied in favor of the transaction RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.refunds),
  0,
  'another owner cannot read the refund'
);
select throws_ok(
  $$
    select public.record_refund(
      p_action := 'create',
      p_operation_id := '41000000-0000-0000-0000-000000000005',
      p_refund_id := null,
      p_expense_id := '31000000-0000-0000-0000-000000000001',
      p_amount := 1.00,
      p_received_on := date '2026-09-22',
      p_expected_version := null
    )
  $$,
  '42501',
  'Refund parent must be an active expense owned by the caller.',
  'another owner cannot refund a hidden expense'
);

select * from finish();
rollback;