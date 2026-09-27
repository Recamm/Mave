begin;

create table public.recurring_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  currency text not null check (currency in ('ARS', 'USD')),
  category_id uuid not null,
  financial_account_id uuid,
  note text,
  starts_on date not null,
  interval_count integer not null check (interval_count between 1 and 365),
  interval_unit text not null check (interval_unit in ('day', 'week', 'month', 'year')),
  occurrence_index integer not null default 0 check (occurrence_index >= 0),
  active boolean not null default true,
  reminder_enabled boolean not null default false,
  reminder_days_before integer not null default 7 check (reminder_days_before between 0 and 365),
  reminder_every_days integer not null default 1 check (reminder_every_days between 1 and 365),
  time_zone text not null default 'UTC',
  last_notified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_movements_amount_valid check (
    amount > 0 and scale(amount) <= 2 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint recurring_movements_note_length check (note is null or char_length(note) <= 2000),
  constraint recurring_movements_user_id_id_key unique (user_id, id),
  constraint recurring_movements_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict,
  constraint recurring_movements_account_owner_currency_fkey foreign key (
    user_id, financial_account_id, currency
  ) references public.financial_accounts (user_id, id, currency) on delete restrict
);

create index recurring_movements_active_owner_idx
  on public.recurring_movements (user_id, starts_on)
  where active;

create trigger recurring_movements_set_updated_at
before update on public.recurring_movements
for each row execute function public.set_updated_at();

create trigger recurring_movements_require_active_category
before insert or update on public.recurring_movements
for each row execute function public.ensure_active_movement_category();

create function public.validate_recurring_movement_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as time_zone
    where time_zone.name = new.time_zone
  ) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger recurring_movements_validate_time_zone
before insert or update of time_zone on public.recurring_movements
for each row execute function public.validate_recurring_movement_time_zone();

create function public.recurring_movement_occurrence_on(
  p_starts_on date,
  p_occurrence_index integer,
  p_interval_count integer,
  p_interval_unit text
)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  interval_multiplier integer;
begin
  if p_occurrence_index < 0 or p_interval_count < 1 then
    raise exception 'Invalid recurring movement interval.' using errcode = '22023';
  end if;

  interval_multiplier := p_occurrence_index * p_interval_count;

  case p_interval_unit
    when 'day' then
      return p_starts_on + interval_multiplier;
    when 'week' then
      return p_starts_on + (interval_multiplier * 7);
    when 'month' then
      return (p_starts_on + make_interval(months => interval_multiplier))::date;
    when 'year' then
      return (p_starts_on + make_interval(years => interval_multiplier))::date;
    else
      raise exception 'Unknown recurring movement interval unit.' using errcode = '22023';
  end case;
end;
$$;

create table public.recurring_movement_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recurring_movement_id uuid not null,
  occurrence_index integer not null check (occurrence_index >= 0),
  due_on date not null,
  paid_on date not null,
  movement_id uuid not null,
  client_operation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint recurring_movement_payments_user_operation_key unique (user_id, client_operation_id),
  constraint recurring_movement_payments_occurrence_key unique (
    recurring_movement_id, occurrence_index
  ),
  constraint recurring_movement_payments_movement_key unique (movement_id),
  constraint recurring_movement_payments_recurring_owner_fkey foreign key (
    user_id, recurring_movement_id
  ) references public.recurring_movements (user_id, id) on delete cascade,
  constraint recurring_movement_payments_movement_owner_fkey foreign key (user_id, movement_id)
    references public.movements (user_id, id) on delete cascade
);

create index recurring_movement_payments_owner_paid_idx
  on public.recurring_movement_payments (user_id, paid_on desc);

create or replace function public.delete_archived_financial_account(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  locked_account_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select account.id
    into locked_account_id
    from public.financial_accounts as account
    where account.user_id = actor_id
      and account.id = p_account_id
      and account.archived_at is not null
    for update;

  if not found then
    return 'unavailable';
  end if;

  if exists (
    select 1
      from public.movements as movement
      where movement.user_id = actor_id
        and movement.financial_account_id = locked_account_id
  ) or exists (
    select 1
      from public.transfers as transfer
      where transfer.user_id = actor_id
        and (
          transfer.source_account_id = locked_account_id
          or transfer.destination_account_id = locked_account_id
        )
  ) or exists (
    select 1
      from public.movement_conflict_revisions as revision
      where revision.user_id = actor_id
        and revision.financial_account_id = locked_account_id
  ) or exists (
    select 1
      from public.recurring_movements as recurring
      where recurring.user_id = actor_id
        and recurring.financial_account_id = locked_account_id
  ) then
    return 'referenced';
  end if;

  delete from public.financial_accounts as account
    where account.user_id = actor_id
      and account.id = locked_account_id
      and account.archived_at is not null;

  if not found then
    return 'unavailable';
  end if;

  return 'deleted';
end;
$$;

alter table public.recurring_movements enable row level security;
alter table public.recurring_movement_payments enable row level security;

revoke all on public.recurring_movements, public.recurring_movement_payments
  from public, anon, authenticated;
grant select on public.recurring_movements to authenticated;
grant insert (
  kind,
  amount,
  currency,
  category_id,
  financial_account_id,
  note,
  starts_on,
  interval_count,
  interval_unit,
  active,
  reminder_enabled,
  reminder_days_before,
  reminder_every_days,
  time_zone
) on public.recurring_movements to authenticated;
grant update (active, reminder_enabled, reminder_days_before, reminder_every_days)
  on public.recurring_movements to authenticated;
grant select on public.recurring_movement_payments to authenticated;
grant all on public.recurring_movements, public.recurring_movement_payments to service_role;

create policy recurring_movements_owner_access on public.recurring_movements
  for all to authenticated
  using (user_id = (select auth.uid()) and public.account_sync_allowed())
  with check (user_id = (select auth.uid()) and public.account_sync_allowed());

create policy recurring_movement_payments_owner_access on public.recurring_movement_payments
  for select to authenticated
  using (user_id = (select auth.uid()) and public.account_sync_allowed());

create function public.mark_recurring_movement_paid(
  p_recurring_movement_id uuid,
  p_expected_occurrence_index integer,
  p_paid_on date,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  recurring_movement public.recurring_movements%rowtype;
  existing_payment public.recurring_movement_payments%rowtype;
  created_movement public.movements%rowtype;
  due_on date;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_recurring_movement_id is null
    or p_expected_occurrence_index is null
    or p_expected_occurrence_index < 0
    or p_paid_on is null
    or p_operation_id is null
  then
    raise exception 'Invalid recurring movement payment.' using errcode = '22023';
  end if;

  if not public.account_sync_allowed() then
    return jsonb_build_object('status', 'blocked');
  end if;

  select payment.*
  into existing_payment
  from public.recurring_movement_payments as payment
  where payment.user_id = actor_id
    and payment.client_operation_id = p_operation_id;

  if found then
    select movement.*
    into created_movement
    from public.movements as movement
    where movement.user_id = actor_id and movement.id = existing_payment.movement_id;

    return jsonb_build_object('status', 'already-paid', 'movement', to_jsonb(created_movement));
  end if;

  select recurring.*
  into recurring_movement
  from public.recurring_movements as recurring
  where recurring.user_id = actor_id and recurring.id = p_recurring_movement_id
  for update;

  if not found then
    raise exception 'Recurring movement is unavailable.' using errcode = '42501';
  end if;

  select payment.*
  into existing_payment
  from public.recurring_movement_payments as payment
  where payment.user_id = actor_id
    and payment.recurring_movement_id = p_recurring_movement_id
    and payment.occurrence_index = p_expected_occurrence_index;

  if found then
    select movement.*
    into created_movement
    from public.movements as movement
    where movement.user_id = actor_id and movement.id = existing_payment.movement_id;

    return jsonb_build_object('status', 'already-paid', 'movement', to_jsonb(created_movement));
  end if;

  if recurring_movement.occurrence_index <> p_expected_occurrence_index then
    return jsonb_build_object('status', 'stale');
  end if;

  if not recurring_movement.active then
    return jsonb_build_object('status', 'inactive');
  end if;

  due_on := public.recurring_movement_occurrence_on(
    recurring_movement.starts_on,
    recurring_movement.occurrence_index,
    recurring_movement.interval_count,
    recurring_movement.interval_unit
  );

  insert into public.movements (
    user_id,
    kind,
    amount,
    currency,
    category_id,
    occurred_on,
    financial_account_id,
    note,
    client_operation_id
  )
  values (
    actor_id,
    recurring_movement.kind,
    recurring_movement.amount,
    recurring_movement.currency,
    recurring_movement.category_id,
    p_paid_on,
    recurring_movement.financial_account_id,
    recurring_movement.note,
    p_operation_id
  )
  returning * into created_movement;

  insert into public.recurring_movement_payments (
    user_id,
    recurring_movement_id,
    occurrence_index,
    due_on,
    paid_on,
    movement_id,
    client_operation_id
  )
  values (
    actor_id,
    recurring_movement.id,
    recurring_movement.occurrence_index,
    due_on,
    p_paid_on,
    created_movement.id,
    p_operation_id
  );

  update public.recurring_movements
  set occurrence_index = occurrence_index + 1,
      last_notified_on = null
  where id = recurring_movement.id;

  return jsonb_build_object(
    'status', 'applied',
    'movement', to_jsonb(created_movement),
    'nextOccurrenceIndex', recurring_movement.occurrence_index + 1
  );
end;
$$;

create function public.claim_due_recurring_movement_reminders(
  p_now timestamptz default statement_timestamp()
)
returns table (
  endpoint text,
  p256dh text,
  auth_secret text,
  recurring_movement_id uuid,
  due_on date,
  kind text,
  amount_text text,
  currency text,
  label text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_now is null then
    raise exception 'A claim time is required.' using errcode = '22023';
  end if;

  return query
  with eligible as materialized (
    select
      recurring.id,
      recurring.user_id,
      recurring.category_id,
      recurring.kind,
      recurring.amount_text,
      recurring.currency,
      recurring.note,
      schedule.local_now::date as local_today,
      schedule.due_on
    from public.recurring_movements as recurring
    cross join lateral (
      select
        p_now at time zone recurring.time_zone as local_now,
        public.recurring_movement_occurrence_on(
          recurring.starts_on,
          recurring.occurrence_index,
          recurring.interval_count,
          recurring.interval_unit
        ) as due_on
    ) as schedule
    where recurring.active
      and recurring.reminder_enabled
      and extract(hour from schedule.local_now) = 9
      and schedule.local_now::date >= schedule.due_on - recurring.reminder_days_before
      and schedule.local_now::date <= schedule.due_on
      and (
        recurring.last_notified_on is null
        or schedule.local_now::date - recurring.last_notified_on >= recurring.reminder_every_days
      )
      and exists (
        select 1
        from public.web_login_push_subscriptions as push_subscription
        where push_subscription.user_id = recurring.user_id
      )
    for update of recurring skip locked
  ), claimed as (
    update public.recurring_movements as recurring
    set last_notified_on = eligible.local_today
    from eligible
    where recurring.id = eligible.id
    returning recurring.id, recurring.user_id
  )
  select
    push_subscription.endpoint,
    push_subscription.p256dh,
    push_subscription.auth_secret,
    claimed.id,
    eligible.due_on,
    eligible.kind,
    eligible.amount_text,
    eligible.currency,
    coalesce(nullif(btrim(eligible.note), ''), category.name)
  from claimed
  join eligible on eligible.id = claimed.id
  join public.categories as category
    on category.user_id = eligible.user_id and category.id = eligible.category_id
  join public.web_login_push_subscriptions as push_subscription
    on push_subscription.user_id = claimed.user_id;
end;
$$;

revoke all on function public.validate_recurring_movement_time_zone()
  from public, anon, authenticated;
revoke all on function public.recurring_movement_occurrence_on(date, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.mark_recurring_movement_paid(uuid, integer, date, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_due_recurring_movement_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_recurring_movement_paid(uuid, integer, date, uuid)
  to authenticated;
grant execute on function public.recurring_movement_occurrence_on(date, integer, integer, text)
  to service_role;
grant execute on function public.claim_due_recurring_movement_reminders(timestamptz)
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-recurring-movement-reminders';

select cron.schedule(
  'process-recurring-movement-reminders',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'account_deletion_project_url'
      ) || '/functions/v1/process-recurring-movement-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'account_deletion_publishable_key'
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'account_deletion_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);

commit;