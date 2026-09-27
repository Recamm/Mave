begin;

create table public.account_lifecycle (
  user_id uuid primary key references auth.users (id) on delete cascade,
  deletion_requested_at timestamptz,
  deletion_due_at timestamptz,
  deletion_canceled_at timestamptz,
  deletion_started_at timestamptz,
  constraint account_lifecycle_deletion_window check (
    (
      deletion_requested_at is null
      and deletion_due_at is null
      and deletion_canceled_at is null
      and deletion_started_at is null
    )
    or (
      deletion_requested_at is not null
      and deletion_due_at is not null
      and deletion_due_at = (
        (deletion_requested_at at time zone 'America/Argentina/Buenos_Aires')
        + interval '30 days'
      ) at time zone 'America/Argentina/Buenos_Aires'
      and not (deletion_canceled_at is not null and deletion_started_at is not null)
    )
  )
);

insert into public.account_lifecycle (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create function public.create_account_lifecycle_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_lifecycle (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_account_lifecycle_for_auth_user()
  from public, anon, authenticated;

create trigger auth_user_create_account_lifecycle
after insert on auth.users
for each row execute function public.create_account_lifecycle_for_auth_user();

alter table public.account_lifecycle enable row level security;
revoke all on public.account_lifecycle from public, anon, authenticated;
grant select on public.account_lifecycle to authenticated;

create policy account_lifecycle_owner_select on public.account_lifecycle
  for select to authenticated
  using (user_id = (select auth.uid()));

create function public.request_account_deletion()
returns public.account_lifecycle
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  lifecycle_row public.account_lifecycle%rowtype;
  request_time timestamptz;
  due_time timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(actor_id::text),
    pg_catalog.hashtext('account-deletion')
  );

  select *
    into lifecycle_row
    from public.account_lifecycle
    where user_id = actor_id
    for update;

  if not found then
    insert into public.account_lifecycle (user_id)
    values (actor_id)
    returning * into lifecycle_row;
  end if;

  if lifecycle_row.deletion_requested_at is not null
    and lifecycle_row.deletion_canceled_at is null
  then
    return lifecycle_row;
  end if;

  request_time := statement_timestamp();
  due_time := (
    (request_time at time zone 'America/Argentina/Buenos_Aires') + interval '30 days'
  ) at time zone 'America/Argentina/Buenos_Aires';

  update public.account_lifecycle
    set deletion_requested_at = request_time,
        deletion_due_at = due_time,
        deletion_canceled_at = null,
        deletion_started_at = null
    where user_id = actor_id
    returning * into lifecycle_row;

  return lifecycle_row;
end;
$$;

create function public.cancel_account_deletion()
returns public.account_lifecycle
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  lifecycle_row public.account_lifecycle%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select *
    into lifecycle_row
    from public.account_lifecycle
    where user_id = actor_id
    for update;

  if not found
    or lifecycle_row.deletion_requested_at is null
    or lifecycle_row.deletion_canceled_at is not null
    or lifecycle_row.deletion_started_at is not null
    or lifecycle_row.deletion_due_at <= statement_timestamp()
  then
    raise exception 'The account deletion request is no longer cancellable.'
      using errcode = '22023';
  end if;

  update public.account_lifecycle
    set deletion_canceled_at = statement_timestamp()
    where user_id = actor_id
    returning * into lifecycle_row;

  return lifecycle_row;
end;
$$;

revoke all on function public.request_account_deletion()
  from public, anon, authenticated;
revoke all on function public.cancel_account_deletion()
  from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create function public.account_sync_allowed()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return not exists (
    select 1
    from public.account_lifecycle
    where user_id = actor_id
      and deletion_requested_at is not null
      and deletion_canceled_at is null
      and deletion_due_at <= statement_timestamp()
  );
end;
$$;

revoke all on function public.account_sync_allowed() from public, anon, authenticated;
grant execute on function public.account_sync_allowed() to authenticated;

alter function public.apply_movement_change(text, uuid, uuid, integer, jsonb)
  rename to apply_movement_change_before_deletion;
revoke all on function public.apply_movement_change_before_deletion(text, uuid, uuid, integer, jsonb)
  from public, anon, authenticated;

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
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.account_lifecycle
    where user_id = actor_id
      and deletion_requested_at is not null
      and deletion_canceled_at is null
      and deletion_due_at <= statement_timestamp()
  ) then
    return jsonb_build_object('status', 'blocked');
  end if;

  return public.apply_movement_change_before_deletion(
    p_action,
    p_operation_id,
    p_movement_id,
    p_expected_version,
    p_payload
  );
end;
$$;

alter function public.resolve_movement_conflict(uuid, uuid, uuid)
  rename to resolve_movement_conflict_before_deletion;
revoke all on function public.resolve_movement_conflict_before_deletion(uuid, uuid, uuid)
  from public, anon, authenticated;

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
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.account_lifecycle
    where user_id = actor_id
      and deletion_requested_at is not null
      and deletion_canceled_at is null
      and deletion_due_at <= statement_timestamp()
  ) then
    return jsonb_build_object('status', 'blocked');
  end if;

  return public.resolve_movement_conflict_before_deletion(
    p_operation_id,
    p_conflict_id,
    p_revision_id
  );
end;
$$;

revoke all on function public.apply_movement_change(text, uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.resolve_movement_conflict(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_movement_change(text, uuid, uuid, integer, jsonb)
  to authenticated;
grant execute on function public.resolve_movement_conflict(uuid, uuid, uuid)
  to authenticated;

commit;