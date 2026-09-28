begin;

alter table public.recurring_movements
  add column deleted_at timestamptz;

alter table public.recurring_movement_payments
  add column reversed_at timestamptz;

alter table public.recurring_movement_payments
  drop constraint recurring_movement_payments_occurrence_key;

create unique index recurring_movement_payments_active_occurrence_key
  on public.recurring_movement_payments (recurring_movement_id, occurrence_index)
  where reversed_at is null;

grant update (
  active,
  amount,
  category_id,
  currency,
  financial_account_id,
  interval_count,
  interval_unit,
  kind,
  note,
  reminder_days_before,
  reminder_enabled,
  reminder_every_days,
  starts_on,
  time_zone,
  deleted_at
) on public.recurring_movements to authenticated;

create or replace function public.reset_recurring_movement_reminder_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.active := false;
    new.reminder_enabled := false;
  end if;

  if new.active is distinct from old.active
    or new.starts_on is distinct from old.starts_on
    or new.interval_count is distinct from old.interval_count
    or new.interval_unit is distinct from old.interval_unit
    or new.reminder_enabled is distinct from old.reminder_enabled
    or new.reminder_days_before is distinct from old.reminder_days_before
    or new.reminder_every_days is distinct from old.reminder_every_days
    or new.time_zone is distinct from old.time_zone
    or new.deleted_at is distinct from old.deleted_at
  then
    new.last_notified_on := null;
  end if;

  return new;
end;
$$;

create trigger recurring_movements_reset_reminder_claim
before update of
  active,
  starts_on,
  interval_count,
  interval_unit,
  reminder_enabled,
  reminder_days_before,
  reminder_every_days,
  time_zone,
  deleted_at
on public.recurring_movements
for each row execute function public.reset_recurring_movement_reminder_claim();

create function public.protect_deleted_recurring_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Deleted recurring movements cannot be changed.' using errcode = '55000';
  end if;

  if new.deleted_at is not null then
    new.deleted_at := pg_catalog.statement_timestamp();
  end if;

  return new;
end;
$$;

create trigger recurring_movements_soft_delete_guard
before update on public.recurring_movements
for each row execute function public.protect_deleted_recurring_movement();

create or replace function public.mark_recurring_movement_paid(
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
  local_today date;
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
    if existing_payment.reversed_at is not null then
      return jsonb_build_object('status', 'already-undone');
    end if;

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
    and payment.occurrence_index = p_expected_occurrence_index
    and payment.reversed_at is null;

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
  local_today := (pg_catalog.statement_timestamp() at time zone recurring_movement.time_zone)::date;

  if due_on > local_today then
    return jsonb_build_object('status', 'not-due', 'dueOn', due_on);
  end if;
  if p_paid_on > local_today then
    return jsonb_build_object('status', 'future-date');
  end if;

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

create function public.undo_recurring_movement_payment(
  p_movement_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  recurring_movement_id uuid;
  recurring_movement public.recurring_movements%rowtype;
  payment public.recurring_movement_payments%rowtype;
  movement public.movements%rowtype;
  movement_change jsonb;
  reopened_occurrence boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_movement_id is null or p_operation_id is null then
    raise exception 'Invalid recurring movement payment reversal.' using errcode = '22023';
  end if;

  if not public.account_sync_allowed() then
    return jsonb_build_object('status', 'blocked');
  end if;

  select stored_payment.recurring_movement_id
  into recurring_movement_id
  from public.recurring_movement_payments as stored_payment
  where stored_payment.user_id = actor_id
    and stored_payment.movement_id = p_movement_id;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select recurring.*
  into recurring_movement
  from public.recurring_movements as recurring
  where recurring.user_id = actor_id and recurring.id = recurring_movement_id
  for update;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select stored_payment.*
  into payment
  from public.recurring_movement_payments as stored_payment
  where stored_payment.user_id = actor_id
    and stored_payment.movement_id = p_movement_id
  for update;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if payment.reversed_at is not null then
    return jsonb_build_object('status', 'already-undone');
  end if;

  select stored_movement.*
  into movement
  from public.movements as stored_movement
  where stored_movement.user_id = actor_id and stored_movement.id = p_movement_id;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if movement.deleted_at is null then
    movement_change := public.apply_movement_change(
      'delete',
      p_operation_id,
      movement.id,
      movement.version,
      null
    );
    if movement_change->>'status' is distinct from 'applied' then
      return movement_change;
    end if;
  end if;

  update public.recurring_movement_payments
  set reversed_at = pg_catalog.statement_timestamp()
  where id = payment.id;

  if recurring_movement.deleted_at is null
    and recurring_movement.occurrence_index = payment.occurrence_index + 1
  then
    update public.recurring_movements
    set occurrence_index = payment.occurrence_index,
        last_notified_on = null
    where id = recurring_movement.id;
    reopened_occurrence := true;
  end if;

  return jsonb_build_object(
    'status', 'undone',
    'movementId', p_movement_id,
    'recurringMovementId', recurring_movement.id,
    'occurrenceReopened', reopened_occurrence
  );
end;
$$;

revoke all on function public.mark_recurring_movement_paid(uuid, integer, date, uuid)
  from public, anon, authenticated;
revoke all on function public.undo_recurring_movement_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_recurring_movement_paid(uuid, integer, date, uuid)
  to authenticated;
grant execute on function public.undo_recurring_movement_payment(uuid, uuid)
  to authenticated;

commit;