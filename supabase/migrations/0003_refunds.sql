begin;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id uuid not null,
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  received_on date not null,
  version integer not null default 1 check (version > 0),
  client_operation_id uuid not null default gen_random_uuid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_amount_valid check (amount > 0 and scale(amount) <= 2),
  constraint refunds_user_id_id_key unique (user_id, id),
  constraint refunds_user_operation_key unique (user_id, client_operation_id),
  constraint refunds_expense_owner_fkey foreign key (user_id, expense_id)
    references public.movements (user_id, id) on delete restrict
);

create index refunds_owner_received_date_idx
  on public.refunds (user_id, received_on desc, created_at desc)
  where deleted_at is null;

create index refunds_expense_active_idx
  on public.refunds (user_id, expense_id)
  where deleted_at is null;

create table public.refund_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null,
  refund_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  request_refund_id uuid,
  request_expense_id uuid,
  request_amount numeric,
  request_received_on date,
  request_expected_version integer,
  result_version integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint refund_operations_refund_owner_fkey foreign key (user_id, refund_id)
    references public.refunds (user_id, id) on delete restrict
);

create trigger refunds_set_updated_at
before update on public.refunds
for each row execute function public.set_updated_at();

create function public.ensure_refunded_expense_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_refund_total numeric;
begin
  if tg_op = 'UPDATE'
    and old.kind = 'expense'
    and (
      new.kind is distinct from old.kind
      or new.amount is distinct from old.amount
      or new.deleted_at is distinct from old.deleted_at
      or new.currency is distinct from old.currency
      or new.category_id is distinct from old.category_id
      or new.financial_account_id is distinct from old.financial_account_id
    )
  then
    select coalesce(sum(amount), 0)
      into active_refund_total
      from public.refunds
      where user_id = old.user_id
        and expense_id = old.id
        and deleted_at is null;

    if active_refund_total > 0
      and (
        new.kind <> 'expense'
        or new.deleted_at is not null
        or new.amount < active_refund_total
        or new.currency is distinct from old.currency
        or new.category_id is distinct from old.category_id
        or new.financial_account_id is distinct from old.financial_account_id
      )
    then
      raise exception 'Expense changes cannot invalidate active refunds.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger movements_preserve_active_refunds
before update on public.movements
for each row execute function public.ensure_refunded_expense_integrity();

create function public.record_refund(
  p_action text,
  p_operation_id uuid,
  p_refund_id uuid,
  p_expense_id uuid,
  p_amount numeric,
  p_received_on date,
  p_expected_version integer
)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  parent_expense_id uuid;
  expense_row public.movements%rowtype;
  refund_row public.refunds%rowtype;
  operation_row public.refund_operations%rowtype;
  active_refund_total numeric;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('create', 'update', 'delete') then
    raise exception 'Refund action is invalid.' using errcode = '22023';
  end if;

  if p_operation_id is null then
    raise exception 'Operation id is required.' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext(p_operation_id::text)
  );

  select *
    into operation_row
    from public.refund_operations
    where user_id = actor_id and operation_id = p_operation_id;

  if found then
    if operation_row.action is distinct from p_action
      or operation_row.request_refund_id is distinct from p_refund_id
      or operation_row.request_expense_id is distinct from p_expense_id
      or operation_row.request_amount is distinct from p_amount
      or operation_row.request_received_on is distinct from p_received_on
      or operation_row.request_expected_version is distinct from p_expected_version
    then
      raise exception 'Operation id has already been used for a different refund request.'
        using errcode = '22023';
    end if;

    select *
      into refund_row
      from public.refunds
      where user_id = actor_id and id = operation_row.refund_id;

    if not found then
      raise exception 'Refund result is unavailable.' using errcode = '42501';
    end if;

    return refund_row;
  end if;

  if p_action = 'create' then
    if p_refund_id is not null or p_expense_id is null or p_expected_version is not null then
      raise exception 'Refund parent must be an active expense owned by the caller.'
        using errcode = '42501';
    end if;

    parent_expense_id := p_expense_id;
  else
    if p_refund_id is null
      or p_expense_id is not null
      or p_expected_version is null
      or (p_action = 'delete' and (p_amount is not null or p_received_on is not null))
    then
      raise exception 'Refund is unavailable.' using errcode = '42501';
    end if;

    select *
      into refund_row
      from public.refunds
      where user_id = actor_id
        and id = p_refund_id
        and deleted_at is null;

    if not found then
      raise exception 'Refund is unavailable.' using errcode = '42501';
    end if;

    parent_expense_id := refund_row.expense_id;
  end if;

  select *
    into expense_row
    from public.movements
    where user_id = actor_id
      and id = parent_expense_id
      and kind = 'expense'
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Refund parent must be an active expense owned by the caller.'
      using errcode = '42501';
  end if;

  if p_action <> 'create' then
    select *
      into refund_row
      from public.refunds
      where user_id = actor_id
        and id = p_refund_id
        and expense_id = expense_row.id
        and deleted_at is null
      for update;

    if not found then
      raise exception 'Refund is unavailable.' using errcode = '42501';
    end if;

    if p_expected_version is distinct from refund_row.version then
      raise exception 'Refund version changed.' using errcode = '40001';
    end if;
  end if;

  if p_action in ('create', 'update') then
    if p_amount is null
      or p_amount <= 0
      or p_amount::text in ('NaN', 'Infinity', '-Infinity')
      or scale(p_amount) > 2
    then
      raise exception 'Refund amount must be positive and have at most two decimal places.'
        using errcode = '23514';
    end if;

    if p_received_on is null then
      raise exception 'Refund received date is required.' using errcode = '23502';
    end if;

    select coalesce(sum(amount), 0)
      into active_refund_total
      from public.refunds
      where user_id = actor_id
        and expense_id = expense_row.id
        and deleted_at is null
        and (p_action = 'create' or id <> refund_row.id);

    if active_refund_total + p_amount > expense_row.amount then
      raise exception 'Refunds cannot exceed the remaining expense amount.'
        using errcode = '23514';
    end if;
  end if;

  if p_action = 'create' then
    insert into public.refunds (
      user_id,
      expense_id,
      amount,
      received_on,
      client_operation_id
    )
    values (
      actor_id,
      expense_row.id,
      p_amount,
      p_received_on,
      p_operation_id
    )
    returning * into refund_row;
  elsif p_action = 'update' then
    update public.refunds
      set amount = p_amount,
          received_on = p_received_on,
          client_operation_id = p_operation_id,
          version = version + 1
      where user_id = actor_id and id = refund_row.id
      returning * into refund_row;
  else
    update public.refunds
      set deleted_at = pg_catalog.now(),
          client_operation_id = p_operation_id,
          version = version + 1
      where user_id = actor_id and id = refund_row.id
      returning * into refund_row;
  end if;

  insert into public.refund_operations (
    user_id,
    operation_id,
    refund_id,
    action,
    request_refund_id,
    request_expense_id,
    request_amount,
    request_received_on,
    request_expected_version,
    result_version
  )
  values (
    actor_id,
    p_operation_id,
    refund_row.id,
    p_action,
    p_refund_id,
    p_expense_id,
    p_amount,
    p_received_on,
    p_expected_version,
    refund_row.version
  );

  return refund_row;
end;
$$;

revoke all on function public.ensure_refunded_expense_integrity() from public, anon, authenticated;
revoke all on function public.record_refund(text, uuid, uuid, uuid, numeric, date, integer)
  from public, anon, authenticated;

alter table public.refunds enable row level security;
alter table public.refund_operations enable row level security;

revoke all on public.refunds, public.refund_operations from public, anon, authenticated;
grant select on public.refunds to authenticated;

create policy refunds_owner_select on public.refunds
  for select to authenticated
  using (user_id = (select auth.uid()));

grant execute on function public.record_refund(text, uuid, uuid, uuid, numeric, date, integer)
  to authenticated;

commit;