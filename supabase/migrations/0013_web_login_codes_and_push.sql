begin;

alter table public.web_login_challenges
  add column login_method text not null default 'qr'
    check (login_method in ('qr', 'code')),
  add column target_user_id uuid references auth.users (id) on delete cascade,
  add column failed_attempts integer not null default 0
    check (failed_attempts between 0 and 5);

create index web_login_code_target_created_idx
  on public.web_login_challenges (target_user_id, created_at desc)
  where login_method = 'code' and target_user_id is not null;

create table public.web_login_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{16,30}$'),
  created_at timestamptz not null default statement_timestamp(),
  check (length(endpoint) between 1 and 2048)
);

create index web_login_push_subscriptions_user_idx
  on public.web_login_push_subscriptions (user_id);

alter table public.web_login_push_subscriptions enable row level security;
revoke all on table public.web_login_push_subscriptions from public, anon, authenticated;
grant all on table public.web_login_push_subscriptions to service_role;

create function public.find_web_login_user_id(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_user_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  if p_email is null or length(trim(p_email)) > 320 then
    return null;
  end if;

  select users.id
  into found_user_id
  from auth.users as users
  where lower(users.email) = lower(trim(p_email))
    and users.email_confirmed_at is not null
  limit 1;

  return found_user_id;
end;
$$;

create function public.create_web_login_code_challenge(
  p_request_id uuid,
  p_target_user_id uuid,
  p_approval_secret_hash text,
  p_poll_secret_hash text,
  p_origin_host text,
  p_expires_at timestamptz
)
returns table (notification_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_user_id uuid;
  recent_request_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  if p_approval_secret_hash !~ '^[0-9a-f]{64}$'
    or p_poll_secret_hash !~ '^[0-9a-f]{64}$'
    or length(p_origin_host) not between 1 and 255
    or p_expires_at <= statement_timestamp()
  then
    raise exception 'Invalid login challenge.' using errcode = '22023';
  end if;

  if p_target_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_target_user_id::text, 0)
    );

    select count(*)::integer
    into recent_request_count
    from public.web_login_challenges as challenge
    where challenge.target_user_id = p_target_user_id
      and challenge.login_method = 'code'
      and challenge.created_at > statement_timestamp() - interval '10 minutes';

    if recent_request_count < 3 then
      effective_user_id := p_target_user_id;
    end if;
  end if;

  insert into public.web_login_challenges (
    id,
    approval_secret_hash,
    poll_secret_hash,
    origin_host,
    status,
    target_user_id,
    login_method,
    failed_attempts,
    expires_at
  )
  values (
    p_request_id,
    p_approval_secret_hash,
    p_poll_secret_hash,
    p_origin_host,
    'pending',
    effective_user_id,
    'code',
    0,
    p_expires_at
  );

  return query select effective_user_id;
end;
$$;

create function public.record_web_login_code_failure(
  p_request_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempts integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  update public.web_login_challenges
  set failed_attempts = failed_attempts + 1,
      status = case when failed_attempts + 1 >= 5 then 'consumed' else status end
  where id = p_request_id
    and target_user_id = p_user_id
    and login_method = 'code'
    and status = 'pending'
    and expires_at > statement_timestamp()
    and failed_attempts < 5
  returning failed_attempts into current_attempts;

  return current_attempts;
end;
$$;

create function public.reject_web_login_code_challenge(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  update public.web_login_challenges
  set status = 'consumed', consumed_at = statement_timestamp()
  where id = p_request_id
    and target_user_id = p_user_id
    and login_method = 'code'
    and status = 'pending'
    and expires_at > statement_timestamp();

  return found;
end;
$$;

create or replace function public.approve_web_login_challenge(
  p_request_id uuid,
  p_approval_secret_hash text,
  p_user_id uuid,
  p_account_email text,
  p_magic_link_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  update public.web_login_challenges
  set status = 'approved',
      user_id = p_user_id,
      account_email = p_account_email,
      magic_link_token_hash = p_magic_link_token_hash,
      approved_at = statement_timestamp()
  where id = p_request_id
    and approval_secret_hash = p_approval_secret_hash
    and login_method = 'qr'
    and status = 'pending'
    and expires_at > statement_timestamp();

  return found;
end;
$$;

create function public.approve_web_login_code_challenge(
  p_request_id uuid,
  p_approval_secret_hash text,
  p_user_id uuid,
  p_account_email text,
  p_magic_link_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  update public.web_login_challenges
  set status = 'approved',
      user_id = p_user_id,
      account_email = p_account_email,
      magic_link_token_hash = p_magic_link_token_hash,
      approved_at = statement_timestamp()
  where id = p_request_id
    and approval_secret_hash = p_approval_secret_hash
    and target_user_id = p_user_id
    and login_method = 'code'
    and status = 'pending'
    and failed_attempts < 5
    and expires_at > statement_timestamp();

  return found;
end;
$$;

revoke all on function public.find_web_login_user_id(text)
  from public, anon, authenticated;
revoke all on function public.create_web_login_code_challenge(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_web_login_code_failure(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reject_web_login_code_challenge(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.approve_web_login_challenge(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.approve_web_login_code_challenge(uuid, text, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.find_web_login_user_id(text) to service_role;
grant execute on function public.create_web_login_code_challenge(uuid, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.record_web_login_code_failure(uuid, uuid) to service_role;
grant execute on function public.reject_web_login_code_challenge(uuid, uuid) to service_role;
grant execute on function public.approve_web_login_challenge(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.approve_web_login_code_challenge(uuid, text, uuid, text, text)
  to service_role;

commit;