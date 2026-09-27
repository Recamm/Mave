begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
values
  (
    '73000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'recurring-owner-one@example.invalid',
    'test-password-hash',
    now()
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'recurring-owner-two@example.invalid',
    'test-password-hash',
    now()
  );

select is(
  public.recurring_movement_occurrence_on('2026-01-31', 1, 1, 'month'),
  '2026-02-28'::date,
  'monthly dates clamp to the last day of shorter months'
);
select is(
  public.recurring_movement_occurrence_on('2026-01-31', 2, 1, 'month'),
  '2026-03-31'::date,
  'monthly dates remain anchored to the original day'
);
select is(
  public.recurring_movement_occurrence_on('2024-02-29', 4, 1, 'year'),
  '2028-02-29'::date,
  'yearly dates preserve leap day when it occurs again'
);
select is(
  public.recurring_movement_occurrence_on('2026-09-27', 2, 1, 'week'),
  '2026-10-11'::date,
  'weekly intervals advance by calendar weeks'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into public.web_login_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
values (
  '73000000-0000-0000-0000-000000000001',
  'https://fcm.googleapis.com/fcm/send/recurring-test',
  repeat('C', 87),
  repeat('D', 22)
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.financial_accounts (id, user_id, name, kind, currency, archived_at)
values (
  '75000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  'Cuenta archivada',
  'bank',
  'ARS',
  statement_timestamp()
);

insert into public.recurring_movements (
  kind,
  amount,
  currency,
  category_id,
  financial_account_id,
  note,
  starts_on,
  interval_count,
  interval_unit,
  reminder_enabled,
  reminder_days_before,
  reminder_every_days,
  time_zone
)
select
  'expense',
  12500,
  'ARS',
  category.id,
  '75000000-0000-0000-0000-000000000001',
  'Gimnasio',
  '2026-09-27',
  1,
  'month',
  true,
  7,
  1,
  'UTC'
from public.categories as category
where category.user_id = '73000000-0000-0000-0000-000000000001'
  and category.name = 'Servicios';

select is(
  (select count(*) from public.recurring_movements),
  1::bigint,
  'an owner can create a private recurring movement'
);
select is(
  public.delete_archived_financial_account('75000000-0000-0000-0000-000000000001'),
  'referenced',
  'an archived account cannot be deleted while a recurrence references it'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.recurring_movements),
  0::bigint,
  'another owner cannot read the recurring movement'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-20 09:15:00+00')),
  1::bigint,
  'a reminder is claimed at its configured lead date'
);
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-20 09:30:00+00')),
  0::bigint,
  'a reminder is claimed no more than once per local day'
);
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-21 09:00:00+00')),
  1::bigint,
  'daily reminders resume on the following day'
);
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-28 09:00:00+00')),
  0::bigint,
  'reminders stop after the due date'
);
update public.recurring_movements
set reminder_every_days = 8, last_notified_on = null;
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-20 09:00:00+00')),
  1::bigint,
  'a one-time reminder is sent when the configured window starts'
);
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-21 09:00:00+00')),
  0::bigint,
  'a one-time reminder is not repeated during the window'
);
select is(
  (select count(*) from public.claim_due_recurring_movement_reminders('2026-09-27 09:00:00+00')),
  0::bigint,
  'a one-time reminder is not repeated on the due date'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.mark_recurring_movement_paid(
    (select id from public.recurring_movements),
    0,
    '2026-09-24',
    '74000000-0000-0000-0000-000000000001'
  )->>'status',
  'applied',
  'marking a recurring movement paid creates its ledger entry'
);
select is(
  (select count(*) from public.movements where client_operation_id = '74000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the payment creates one ledger movement'
);
select is(
  (select occurred_on from public.movements where client_operation_id = '74000000-0000-0000-0000-000000000001'),
  '2026-09-24'::date,
  'the ledger movement uses the actual paid date'
);
select is(
  (select occurrence_index from public.recurring_movements),
  1,
  'payment advances the recurring schedule by one occurrence'
);
select is(
  public.mark_recurring_movement_paid(
    (select id from public.recurring_movements),
    0,
    '2026-09-24',
    '74000000-0000-0000-0000-000000000002'
  )->>'status',
  'already-paid',
  'retries for a paid occurrence do not create a second movement'
);
select is(
  (select count(*) from public.movements),
  1::bigint,
  'an occurrence is never recorded twice'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.mark_recurring_movement_paid(uuid,integer,date,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot mark recurring movements paid'
);

select * from finish();
rollback;