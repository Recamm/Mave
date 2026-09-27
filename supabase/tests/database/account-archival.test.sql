begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '17000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'archive-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '17000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'archive-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

insert into public.categories (id, user_id, name, source)
values (
  '18000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  'Categoría de archivo',
  'custom'
);

insert into public.financial_accounts (id, user_id, name, kind, currency)
values
  (
    '27000000-0000-0000-0000-000000000002',
    '17000000-0000-0000-0000-000000000001',
    'Cuenta con movimiento',
    'bank',
    'ARS'
  ),
  (
    '27000000-0000-0000-0000-000000000003',
    '17000000-0000-0000-0000-000000000001',
    'Cuenta con transferencia',
    'bank',
    'ARS'
  ),
  (
    '27000000-0000-0000-0000-000000000004',
    '17000000-0000-0000-0000-000000000001',
    'Cuenta con revisión',
    'bank',
    'ARS'
  ),
  (
    '27000000-0000-0000-0000-000000000005',
    '17000000-0000-0000-0000-000000000001',
    'Cuenta vacía',
    'bank',
    'ARS'
  ),
  (
    '27000000-0000-0000-0000-000000000006',
    '17000000-0000-0000-0000-000000000001',
    'Cuenta destino',
    'bank',
    'ARS'
  );

insert into public.movements (
  id,
  user_id,
  kind,
  amount,
  currency,
  category_id,
  occurred_on,
  financial_account_id
)
values
  (
    '37000000-0000-0000-0000-000000000001',
    '17000000-0000-0000-0000-000000000001',
    'expense',
    10,
    'ARS',
    '18000000-0000-0000-0000-000000000001',
    '2026-09-26',
    '27000000-0000-0000-0000-000000000002'
  ),
  (
    '37000000-0000-0000-0000-000000000002',
    '17000000-0000-0000-0000-000000000001',
    'expense',
    20,
    'ARS',
    '18000000-0000-0000-0000-000000000001',
    '2026-09-26',
    null
  );

insert into public.transfers (
  id,
  user_id,
  source_account_id,
  destination_account_id,
  amount,
  occurred_on
)
values (
  '38000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000003',
  '27000000-0000-0000-0000-000000000006',
  15,
  '2026-09-26'
);

insert into public.movement_conflicts (id, user_id, movement_id)
values (
  '48000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000002'
);

insert into public.movement_conflict_revisions (
  id,
  user_id,
  conflict_id,
  source,
  action,
  expected_version,
  kind,
  amount,
  currency,
  category_id,
  occurred_on,
  financial_account_id
)
values (
  '49000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001',
  'client',
  'update',
  1,
  'expense',
  20,
  'ARS',
  '18000000-0000-0000-0000-000000000001',
  '2026-09-26',
  '27000000-0000-0000-0000-000000000004'
);

update public.financial_accounts
set archived_at = statement_timestamp()
where id in (
  '27000000-0000-0000-0000-000000000002',
  '27000000-0000-0000-0000-000000000003',
  '27000000-0000-0000-0000-000000000004',
  '27000000-0000-0000-0000-000000000005'
);

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.financial_accounts (id, name, kind, currency)
values (
  '27000000-0000-0000-0000-000000000001',
  'Cuenta archivada',
  'bank',
  'ARS'
);

select lives_ok(
  $$
    update public.financial_accounts
    set archived_at = statement_timestamp()
    where id = '27000000-0000-0000-0000-000000000001'
  $$,
  'owner can archive their account'
);
select is(
  (
    select archived_at is not null
    from public.financial_accounts
    where id = '27000000-0000-0000-0000-000000000001'
  ),
  true,
  'archiving records a timestamp'
);
select is(
  (
    select count(*)::integer
    from public.financial_accounts
    where id = '27000000-0000-0000-0000-000000000001'
  ),
  1,
  'archiving preserves the account row and history references'
);
select lives_ok(
  $$
    update public.financial_accounts
    set archived_at = null
    where id = '27000000-0000-0000-0000-000000000001'
  $$,
  'owner can restore their archived account'
);
select is(
  (
    select archived_at is null
    from public.financial_accounts
    where id = '27000000-0000-0000-0000-000000000001'
  ),
  true,
  'restoring clears the archival timestamp'
);
select throws_ok(
  $$
    update public.financial_accounts
    set currency = 'USD'
    where id = '27000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'owner cannot change account fields beyond the archival timestamp'
);

reset role;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"17000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    update public.financial_accounts
    set archived_at = statement_timestamp()
    where id = '27000000-0000-0000-0000-000000000001'
  $$,
  'another owner cannot archive this account through row-level security'
);
select is(
  (select count(*)::integer from public.financial_accounts),
  0,
  'another owner cannot see the account'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000005'),
  'unavailable',
  'another owner cannot permanently delete an archived account'
);

reset role;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select archived_at is null
    from public.financial_accounts
    where id = '27000000-0000-0000-0000-000000000001'
  ),
  true,
  'a foreign owner cannot archive or otherwise alter this account'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000001'),
  'unavailable',
  'an active account cannot be permanently deleted'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000002'),
  'referenced',
  'an account with a movement cannot be permanently deleted'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000003'),
  'referenced',
  'an account with a transfer cannot be permanently deleted'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000004'),
  'referenced',
  'an account with a conflict revision cannot be permanently deleted'
);
select is(
  public.delete_archived_financial_account('27000000-0000-0000-0000-000000000005'),
  'deleted',
  'the owner can permanently delete an unused archived account'
);
select is(
  (
    select count(*)::integer
    from public.financial_accounts
    where id = '27000000-0000-0000-0000-000000000005'
  ),
  0,
  'permanent deletion removes the archived account row'
);

select * from finish();
rollback;