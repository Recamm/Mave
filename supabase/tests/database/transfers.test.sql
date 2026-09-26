begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '13000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'transfer-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '13000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'transfer-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.financial_accounts (id, name, kind, currency)
values (
  '23000000-0000-0000-0000-000000000004',
  'Cuenta ajena',
  'bank',
  'ARS'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"13000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.financial_accounts (id, name, kind, currency, opening_balance)
values
  ('23000000-0000-0000-0000-000000000001', 'Efectivo ARS', 'cash', 'ARS', 1000.00),
  ('23000000-0000-0000-0000-000000000002', 'Banco ARS', 'bank', 'ARS', 0),
  ('23000000-0000-0000-0000-000000000003', 'Billetera USD', 'wallet', 'USD', 0);

select lives_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000001',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000002',
      p_amount := 125.50,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  'owner can transfer funds between their same-currency accounts'
);
select is(
  (
    select amount_text
    from public.transfers
    where client_operation_id = '44000000-0000-0000-0000-000000000001'
  ),
  '125.50',
  'transfer preserves its exact decimal amount'
);
select is(
  (
    select transfer.id::text
    from public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000001',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000002',
      p_amount := 125.50,
      p_occurred_on := date '2026-09-26'
    ) as transfer
  ),
  (
    select id::text
    from public.transfers
    where client_operation_id = '44000000-0000-0000-0000-000000000001'
  ),
  'retrying the same operation returns the original transfer'
);
select is(
  (
    select count(*)::integer
    from public.transfers
    where client_operation_id = '44000000-0000-0000-0000-000000000001'
  ),
  1,
  'an idempotent retry does not duplicate the transfer'
);
select throws_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000001',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000002',
      p_amount := 126.50,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  '22023',
  'Operation id has already been used for a different transfer request.',
  'an operation id cannot be reused for different transfer data'
);
select throws_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000002',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000001',
      p_amount := 1.00,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  '23514',
  'Transfer accounts must be distinct.',
  'a transfer cannot use the same account twice'
);
select throws_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000003',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000003',
      p_amount := 1.00,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  '23514',
  'Transfer accounts must use the same currency.',
  'a transfer between different currencies is rejected'
);
select throws_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000004',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000002',
      p_amount := 0,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  '23514',
  'Transfer amount must be positive and have at most two decimal places.',
  'zero and negative transfer amounts are rejected'
);
select is(
  (select count(*)::integer from public.transfers),
  1,
  'rejected transfer requests leave no partial rows'
);
select throws_ok(
  $$
    insert into public.transfers (
      source_account_id,
      destination_account_id,
      amount,
      occurred_on
    )
    values (
      '23000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000002',
      1.00,
      date '2026-09-26'
    )
  $$,
  '42501',
  null,
  'direct transfer table writes are denied in favor of the transaction RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.transfers),
  0,
  'another owner cannot read a transfer'
);
select throws_ok(
  $$
    select public.record_transfer(
      p_operation_id := '44000000-0000-0000-0000-000000000005',
      p_source_account_id := '23000000-0000-0000-0000-000000000001',
      p_destination_account_id := '23000000-0000-0000-0000-000000000004',
      p_amount := 1.00,
      p_occurred_on := date '2026-09-26'
    )
  $$,
  '42501',
  'Transfer accounts must belong to the authenticated owner.',
  'a transfer cannot reference another owner account'
);
select is(
  (select count(*)::integer from public.transfers),
  0,
  'a rejected cross-owner request creates no transfer'
);

select * from finish();
rollback;