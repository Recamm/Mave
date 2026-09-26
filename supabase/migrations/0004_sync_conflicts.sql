begin;

create table public.movement_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movement_id uuid not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  chosen_revision_id uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint movement_conflicts_user_id_id_key unique (user_id, id),
  constraint movement_conflicts_movement_owner_fkey foreign key (user_id, movement_id)
    references public.movements (user_id, id) on delete cascade,
  constraint movement_conflicts_resolution_state check (
    (status = 'open' and chosen_revision_id is null and resolved_at is null)
    or (status = 'resolved' and chosen_revision_id is not null and resolved_at is not null)
  )
);

create unique index movement_conflicts_one_open_per_movement_key
  on public.movement_conflicts (user_id, movement_id)
  where status = 'open';

create table public.movement_conflict_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conflict_id uuid not null,
  source text not null check (source in ('server', 'client')),
  action text not null check (action in ('create', 'update', 'delete')),
  expected_version integer not null check (expected_version > 0),
  kind text not null check (kind in ('income', 'expense')),
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  currency text not null check (currency in ('ARS', 'USD')),
  category_id uuid not null,
  occurred_on date not null,
  financial_account_id uuid,
  note text,
  captured_at timestamptz not null default now(),
  constraint movement_conflict_revisions_amount_valid check (amount > 0 and scale(amount) <= 2),
  constraint movement_conflict_revisions_note_length check (
    note is null or char_length(note) <= 2000
  ),
  constraint movement_conflict_revisions_user_id_id_key unique (user_id, id),
  constraint movement_conflict_revisions_conflict_owner_fkey foreign key (user_id, conflict_id)
    references public.movement_conflicts (user_id, id) on delete cascade,
  constraint movement_conflict_revisions_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict,
  constraint movement_conflict_revisions_account_owner_currency_fkey
    foreign key (user_id, financial_account_id, currency)
    references public.financial_accounts (user_id, id, currency) on delete restrict
);

alter table public.movement_conflicts
  add constraint movement_conflicts_chosen_revision_owner_fkey
  foreign key (user_id, chosen_revision_id)
  references public.movement_conflict_revisions (user_id, id) on delete restrict;

create index movement_conflict_revisions_conflict_idx
  on public.movement_conflict_revisions (user_id, conflict_id, captured_at, id);

create table public.movement_sync_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  movement_id uuid not null,
  expected_version integer,
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint movement_sync_operations_expected_version check (
    expected_version is null or expected_version > 0
  ),
  constraint movement_sync_operations_movement_owner_fkey foreign key (user_id, movement_id)
    references public.movements (user_id, id) on delete cascade
);

create table public.movement_conflict_resolution_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null,
  conflict_id uuid not null,
  revision_id uuid not null,
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint movement_conflict_resolution_conflict_owner_fkey
    foreign key (user_id, conflict_id)
    references public.movement_conflicts (user_id, id) on delete cascade,
  constraint movement_conflict_resolution_revision_owner_fkey
    foreign key (user_id, revision_id)
    references public.movement_conflict_revisions (user_id, id) on delete cascade
);

create function public.movement_to_sync_json(p_movement public.movements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_movement.id,
    'user_id', p_movement.user_id,
    'kind', p_movement.kind,
    'amount_text', p_movement.amount_text,
    'currency', p_movement.currency,
    'category_id', p_movement.category_id,
    'occurred_on', p_movement.occurred_on,
    'financial_account_id', p_movement.financial_account_id,
    'note', p_movement.note,
    'version', p_movement.version,
    'client_operation_id', p_movement.client_operation_id,
    'deleted_at', p_movement.deleted_at,
    'created_at', p_movement.created_at,
    'updated_at', p_movement.updated_at
  );
$$;

create function public.movement_conflict_revision_to_sync_json(
  p_revision public.movement_conflict_revisions
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_revision.id,
    'user_id', p_revision.user_id,
    'conflict_id', p_revision.conflict_id,
    'source', p_revision.source,
    'action', p_revision.action,
    'expected_version', p_revision.expected_version,
    'kind', p_revision.kind,
    'amount_text', p_revision.amount_text,
    'currency', p_revision.currency,
    'category_id', p_revision.category_id,
    'occurred_on', p_revision.occurred_on,
    'financial_account_id', p_revision.financial_account_id,
    'note', p_revision.note,
    'captured_at', p_revision.captured_at
  );
$$;

create function public.apply_movement_change(
  p_action text,
  p_operation_id uuid,
  p_movement_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_document jsonb;
  operation_row public.movement_sync_operations%rowtype;
  movement_row public.movements%rowtype;
  conflict_row public.movement_conflicts%rowtype;
  incoming_kind text;
  incoming_amount numeric;
  incoming_currency text;
  incoming_category_id uuid;
  incoming_occurred_on date;
  incoming_financial_account_id uuid;
  incoming_note text;
  revisions_json jsonb;
  result_json jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('create', 'update', 'delete') then
    raise exception 'Movement action is invalid.' using errcode = '22023';
  end if;

  if p_operation_id is null or p_movement_id is null then
    raise exception 'Movement operation and id are required.' using errcode = '22004';
  end if;

  if (p_action = 'create' and p_expected_version is not null)
    or (p_action <> 'create' and (p_expected_version is null or p_expected_version < 1))
    or (p_action = 'delete' and p_payload is not null)
    or (p_action <> 'delete' and (p_payload is null or jsonb_typeof(p_payload) <> 'object'))
  then
    raise exception 'Movement request is invalid.' using errcode = '22023';
  end if;

  if p_action <> 'delete' then
    if (p_payload ?& array[
      'kind',
      'amount',
      'currency',
      'category_id',
      'occurred_on',
      'financial_account_id',
      'note'
    ]) is not true
      or p_payload - array[
        'kind',
        'amount',
        'currency',
        'category_id',
        'occurred_on',
        'financial_account_id',
        'note'
      ] <> '{}'::jsonb
      or jsonb_typeof(p_payload->'kind') is distinct from 'string'
      or jsonb_typeof(p_payload->'amount') is distinct from 'string'
      or jsonb_typeof(p_payload->'currency') is distinct from 'string'
      or jsonb_typeof(p_payload->'category_id') is distinct from 'string'
      or jsonb_typeof(p_payload->'occurred_on') is distinct from 'string'
      or jsonb_typeof(p_payload->'financial_account_id') not in ('string', 'null')
      or jsonb_typeof(p_payload->'note') not in ('string', 'null')
    then
      raise exception 'Movement payload is invalid.' using errcode = '22023';
    end if;

    incoming_kind := p_payload->>'kind';
    if incoming_kind not in ('income', 'expense') then
      raise exception 'Movement kind is invalid.' using errcode = '23514';
    end if;

    if (p_payload->>'amount') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'Movement amount must be positive with at most two decimal places.'
        using errcode = '23514';
    end if;
    incoming_amount := (p_payload->>'amount')::numeric;
    if incoming_amount <= 0 then
      raise exception 'Movement amount must be positive with at most two decimal places.'
        using errcode = '23514';
    end if;

    incoming_currency := p_payload->>'currency';
    if incoming_currency not in ('ARS', 'USD') then
      raise exception 'Movement currency is invalid.' using errcode = '23514';
    end if;

    incoming_category_id := (p_payload->>'category_id')::uuid;
    if (p_payload->>'occurred_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Movement date is invalid.' using errcode = '22007';
    end if;
    incoming_occurred_on := (p_payload->>'occurred_on')::date;
    if pg_catalog.to_char(incoming_occurred_on, 'YYYY-MM-DD') <> p_payload->>'occurred_on' then
      raise exception 'Movement date is invalid.' using errcode = '22007';
    end if;

    if p_payload->>'financial_account_id' is not null then
      incoming_financial_account_id := (p_payload->>'financial_account_id')::uuid;
    end if;
    incoming_note := p_payload->>'note';
    if incoming_note is not null and pg_catalog.char_length(incoming_note) > 2000 then
      raise exception 'Movement note is too long.' using errcode = '23514';
    end if;
  end if;

  request_document := jsonb_build_object(
    'action', p_action,
    'movement_id', p_movement_id,
    'expected_version', p_expected_version,
    'payload', p_payload
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext(p_operation_id::text)
  );

  select *
    into operation_row
    from public.movement_sync_operations
    where user_id = actor_id and operation_id = p_operation_id;

  if found then
    if operation_row.request_payload is distinct from request_document then
      raise exception 'Operation id has already been used for a different movement change.'
        using errcode = '22023';
    end if;

    return operation_row.result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext(p_movement_id::text)
  );

  if p_action = 'create' then
    insert into public.movements (
      id,
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
      p_movement_id,
      actor_id,
      incoming_kind,
      incoming_amount,
      incoming_currency,
      incoming_category_id,
      incoming_occurred_on,
      incoming_financial_account_id,
      incoming_note,
      p_operation_id
    )
    on conflict (id) do nothing
    returning * into movement_row;

    if not found then
      raise exception 'Movement is unavailable.' using errcode = '42501';
    end if;

    result_json := jsonb_build_object(
      'status', 'applied',
      'movement', public.movement_to_sync_json(movement_row),
      'conflict_id', null,
      'revisions', '[]'::jsonb
    );

    insert into public.movement_sync_operations (
      user_id,
      operation_id,
      action,
      movement_id,
      expected_version,
      request_payload,
      result
    )
    values (
      actor_id,
      p_operation_id,
      p_action,
      p_movement_id,
      p_expected_version,
      request_document,
      result_json
    );

    return result_json;
  end if;

  select *
    into movement_row
    from public.movements
    where user_id = actor_id and id = p_movement_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Movement is unavailable.' using errcode = '42501';
  end if;

  if p_action = 'delete' then
    incoming_kind := movement_row.kind;
    incoming_amount := movement_row.amount;
    incoming_currency := movement_row.currency;
    incoming_category_id := movement_row.category_id;
    incoming_occurred_on := movement_row.occurred_on;
    incoming_financial_account_id := movement_row.financial_account_id;
    incoming_note := movement_row.note;
  end if;

  select *
    into conflict_row
    from public.movement_conflicts
    where user_id = actor_id
      and movement_id = p_movement_id
      and status = 'open'
    for update;

  if found then
    insert into public.movement_conflict_revisions (
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
      financial_account_id,
      note
    )
    values (
      actor_id,
      conflict_row.id,
      'client',
      p_action,
      p_expected_version,
      incoming_kind,
      incoming_amount,
      incoming_currency,
      incoming_category_id,
      incoming_occurred_on,
      incoming_financial_account_id,
      incoming_note
    );
  elsif movement_row.version <> p_expected_version then
    insert into public.movement_conflicts (user_id, movement_id)
    values (actor_id, p_movement_id)
    returning * into conflict_row;

    insert into public.movement_conflict_revisions (
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
      financial_account_id,
      note
    )
    values (
      actor_id,
      conflict_row.id,
      'server',
      'update',
      movement_row.version,
      movement_row.kind,
      movement_row.amount,
      movement_row.currency,
      movement_row.category_id,
      movement_row.occurred_on,
      movement_row.financial_account_id,
      movement_row.note
    );

    insert into public.movement_conflict_revisions (
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
      financial_account_id,
      note
    )
    values (
      actor_id,
      conflict_row.id,
      'client',
      p_action,
      p_expected_version,
      incoming_kind,
      incoming_amount,
      incoming_currency,
      incoming_category_id,
      incoming_occurred_on,
      incoming_financial_account_id,
      incoming_note
    );
  else
    if p_action = 'update' then
      update public.movements
        set kind = incoming_kind,
            amount = incoming_amount,
            currency = incoming_currency,
            category_id = incoming_category_id,
            occurred_on = incoming_occurred_on,
            financial_account_id = incoming_financial_account_id,
            note = incoming_note,
            client_operation_id = p_operation_id,
            version = version + 1
        where user_id = actor_id and id = p_movement_id
        returning * into movement_row;
    else
      update public.movements
        set deleted_at = pg_catalog.now(),
            client_operation_id = p_operation_id,
            version = version + 1
        where user_id = actor_id and id = p_movement_id
        returning * into movement_row;
    end if;

    result_json := jsonb_build_object(
      'status', 'applied',
      'movement', public.movement_to_sync_json(movement_row),
      'conflict_id', null,
      'revisions', '[]'::jsonb
    );

    insert into public.movement_sync_operations (
      user_id,
      operation_id,
      action,
      movement_id,
      expected_version,
      request_payload,
      result
    )
    values (
      actor_id,
      p_operation_id,
      p_action,
      p_movement_id,
      p_expected_version,
      request_document,
      result_json
    );

    return result_json;
  end if;

  select coalesce(
    jsonb_agg(
      public.movement_conflict_revision_to_sync_json(revision_row)
      order by revision_row.captured_at, revision_row.id
    ),
    '[]'::jsonb
  )
    into revisions_json
    from public.movement_conflict_revisions as revision_row
    where user_id = actor_id and conflict_id = conflict_row.id;

  result_json := jsonb_build_object(
    'status', 'conflict',
    'movement', public.movement_to_sync_json(movement_row),
    'conflict_id', conflict_row.id,
    'revisions', revisions_json
  );

  insert into public.movement_sync_operations (
    user_id,
    operation_id,
    action,
    movement_id,
    expected_version,
    request_payload,
    result
  )
  values (
    actor_id,
    p_operation_id,
    p_action,
    p_movement_id,
    p_expected_version,
    request_document,
    result_json
  );

  return result_json;
end;
$$;

create function public.resolve_movement_conflict(
  p_operation_id uuid,
  p_conflict_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_document jsonb;
  operation_row public.movement_conflict_resolution_operations%rowtype;
  conflict_row public.movement_conflicts%rowtype;
  revision_row public.movement_conflict_revisions%rowtype;
  movement_row public.movements%rowtype;
  result_json jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_operation_id is null or p_conflict_id is null or p_revision_id is null then
    raise exception 'Conflict, operation, and revision ids are required.' using errcode = '22004';
  end if;

  request_document := jsonb_build_object(
    'conflict_id', p_conflict_id,
    'revision_id', p_revision_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext(p_operation_id::text)
  );

  select *
    into operation_row
    from public.movement_conflict_resolution_operations
    where user_id = actor_id and operation_id = p_operation_id;

  if found then
    if operation_row.request_payload is distinct from request_document then
      raise exception 'Operation id has already been used for a different conflict choice.'
        using errcode = '22023';
    end if;

    return operation_row.result;
  end if;

  select *
    into conflict_row
    from public.movement_conflicts
    where user_id = actor_id and id = p_conflict_id;

  if not found then
    raise exception 'Conflict is unavailable.' using errcode = '42501';
  end if;

  select *
    into movement_row
    from public.movements
    where user_id = actor_id and id = conflict_row.movement_id
    for update;

  if not found then
    raise exception 'Conflict is unavailable.' using errcode = '42501';
  end if;

  select *
    into conflict_row
    from public.movement_conflicts
    where user_id = actor_id and id = p_conflict_id
    for update;

  if conflict_row.status <> 'open' then
    raise exception 'Conflict has already been resolved.' using errcode = '40001';
  end if;

  select *
    into revision_row
    from public.movement_conflict_revisions
    where user_id = actor_id
      and conflict_id = p_conflict_id
      and id = p_revision_id;

  if not found then
    raise exception 'Conflict revision is unavailable.' using errcode = '42501';
  end if;

  if revision_row.source = 'client' then
    if revision_row.action = 'delete' then
      update public.movements
        set deleted_at = pg_catalog.now(),
            client_operation_id = p_operation_id,
            version = version + 1
        where user_id = actor_id and id = conflict_row.movement_id
        returning * into movement_row;
    else
      update public.movements
        set kind = revision_row.kind,
            amount = revision_row.amount,
            currency = revision_row.currency,
            category_id = revision_row.category_id,
            occurred_on = revision_row.occurred_on,
            financial_account_id = revision_row.financial_account_id,
            note = revision_row.note,
            deleted_at = null,
            client_operation_id = p_operation_id,
            version = version + 1
        where user_id = actor_id and id = conflict_row.movement_id
        returning * into movement_row;
    end if;
  end if;

  update public.movement_conflicts
    set status = 'resolved',
        chosen_revision_id = revision_row.id,
        resolved_at = pg_catalog.now()
    where user_id = actor_id and id = conflict_row.id
    returning * into conflict_row;

  result_json := jsonb_build_object(
    'status', 'resolved',
    'movement', public.movement_to_sync_json(movement_row),
    'conflict_id', conflict_row.id,
    'chosen_revision_id', revision_row.id
  );

  insert into public.movement_conflict_resolution_operations (
    user_id,
    operation_id,
    conflict_id,
    revision_id,
    request_payload,
    result
  )
  values (
    actor_id,
    p_operation_id,
    p_conflict_id,
    p_revision_id,
    request_document,
    result_json
  );

  return result_json;
end;
$$;

alter table public.movement_conflicts enable row level security;
alter table public.movement_conflict_revisions enable row level security;
alter table public.movement_sync_operations enable row level security;
alter table public.movement_conflict_resolution_operations enable row level security;

revoke all on public.movements from public, anon, authenticated;
grant select on public.movements to authenticated;
revoke all on public.movement_conflicts, public.movement_conflict_revisions,
  public.movement_sync_operations, public.movement_conflict_resolution_operations
  from public, anon, authenticated;
grant select on public.movement_conflicts, public.movement_conflict_revisions to authenticated;

create policy movement_conflicts_owner_select on public.movement_conflicts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy movement_conflict_revisions_owner_select on public.movement_conflict_revisions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.movement_to_sync_json(public.movements)
  from public, anon, authenticated;
revoke all on function public.movement_conflict_revision_to_sync_json(
  public.movement_conflict_revisions
) from public, anon, authenticated;
revoke all on function public.apply_movement_change(text, uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.resolve_movement_conflict(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.apply_movement_change(text, uuid, uuid, integer, jsonb)
  to authenticated;
grant execute on function public.resolve_movement_conflict(uuid, uuid, uuid)
  to authenticated;

commit;