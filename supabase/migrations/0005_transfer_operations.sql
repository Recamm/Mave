begin;

create table public.transfer_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null,
  source_account_id uuid not null,
  destination_account_id uuid not null,
  amount numeric not null,
  occurred_on date not null,
  transfer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint transfer_operations_amount_valid check (amount > 0 and scale(amount) <= 2),
  constraint transfer_operations_accounts_distinct check (
    source_account_id <> destination_account_id
  ),
  constraint transfer_operations_transfer_owner_fkey foreign key (user_id, transfer_id)
    references public.transfers (user_id, id) on delete cascade
);

create function public.record_transfer(
  p_operation_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_occurred_on date
)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  operation_row public.transfer_operations%rowtype;
  source_account_row public.financial_accounts%rowtype;
  destination_account_row public.financial_accounts%rowtype;
  transfer_row public.transfers%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_operation_id is null
    or p_source_account_id is null
    or p_destination_account_id is null
    or p_amount is null
    or p_occurred_on is null
  then
    raise exception 'Transfer operation, accounts, amount, and date are required.'
      using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext(p_operation_id::text)
  );

  select *
    into operation_row
    from public.transfer_operations
    where user_id = actor_id and operation_id = p_operation_id;

  if found then
    if operation_row.source_account_id is distinct from p_source_account_id
      or operation_row.destination_account_id is distinct from p_destination_account_id
      or operation_row.amount is distinct from p_amount
      or operation_row.occurred_on is distinct from p_occurred_on
    then
      raise exception 'Operation id has already been used for a different transfer request.'
        using errcode = '22023';
    end if;

    select *
      into transfer_row
      from public.transfers
      where user_id = actor_id and id = operation_row.transfer_id;

    if not found then
      raise exception 'Transfer result is unavailable.' using errcode = '42501';
    end if;

    return transfer_row;
  end if;

  if p_source_account_id = p_destination_account_id then
    raise exception 'Transfer accounts must be distinct.' using errcode = '23514';
  end if;

  if p_amount <= 0
    or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or scale(p_amount) > 2
  then
    raise exception 'Transfer amount must be positive and have at most two decimal places.'
      using errcode = '23514';
  end if;

  select *
    into source_account_row
    from public.financial_accounts
    where user_id = actor_id and id = p_source_account_id
    for key share;

  if not found then
    raise exception 'Transfer accounts must belong to the authenticated owner.'
      using errcode = '42501';
  end if;

  select *
    into destination_account_row
    from public.financial_accounts
    where user_id = actor_id and id = p_destination_account_id
    for key share;

  if not found then
    raise exception 'Transfer accounts must belong to the authenticated owner.'
      using errcode = '42501';
  end if;

  if source_account_row.currency <> destination_account_row.currency then
    raise exception 'Transfer accounts must use the same currency.' using errcode = '23514';
  end if;

  insert into public.transfers (
    user_id,
    source_account_id,
    destination_account_id,
    amount,
    occurred_on,
    client_operation_id
  )
  values (
    actor_id,
    p_source_account_id,
    p_destination_account_id,
    p_amount,
    p_occurred_on,
    p_operation_id
  )
  returning * into transfer_row;

  insert into public.transfer_operations (
    user_id,
    operation_id,
    source_account_id,
    destination_account_id,
    amount,
    occurred_on,
    transfer_id
  )
  values (
    actor_id,
    p_operation_id,
    p_source_account_id,
    p_destination_account_id,
    p_amount,
    p_occurred_on,
    transfer_row.id
  );

  return transfer_row;
end;
$$;

alter table public.transfer_operations enable row level security;

revoke all on public.transfers, public.transfer_operations from public, anon, authenticated;
grant select on public.transfers to authenticated;

revoke all on function public.record_transfer(uuid, uuid, uuid, numeric, date)
  from public, anon, authenticated;
grant execute on function public.record_transfer(uuid, uuid, uuid, numeric, date)
  to authenticated;

commit;