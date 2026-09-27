begin;

create table public.web_login_challenges (
  id uuid primary key default gen_random_uuid(),
  approval_secret_hash text not null unique
    check (approval_secret_hash ~ '^[0-9a-f]{64}$'),
  poll_secret_hash text not null unique
    check (poll_secret_hash ~ '^[0-9a-f]{64}$'),
  origin_host text not null check (length(origin_host) between 1 and 255),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'consumed')),
  user_id uuid references auth.users (id) on delete cascade,
  account_email text,
  magic_link_token_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  approved_at timestamptz,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create index web_login_challenges_expiry_idx
  on public.web_login_challenges (expires_at);

alter table public.web_login_challenges enable row level security;
revoke all on table public.web_login_challenges from public, anon, authenticated;
grant all on table public.web_login_challenges to service_role;

create function public.approve_web_login_challenge(
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
    and status = 'pending'
    and expires_at > statement_timestamp();

  return found;
end;
$$;

create function public.consume_web_login_challenge(
  p_request_id uuid,
  p_poll_secret_hash text
)
returns table (account_email text, magic_link_token_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_email text;
  challenge_token_hash text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  select challenge.account_email, challenge.magic_link_token_hash
  into challenge_email, challenge_token_hash
  from public.web_login_challenges as challenge
  where challenge.id = p_request_id
    and challenge.poll_secret_hash = p_poll_secret_hash
    and challenge.status = 'approved'
    and challenge.expires_at > statement_timestamp()
  for update skip locked;

  if not found then
    return;
  end if;

  update public.web_login_challenges
  set status = 'consumed',
      magic_link_token_hash = null,
      consumed_at = statement_timestamp()
  where id = p_request_id;

  return query select challenge_email, challenge_token_hash;
end;
$$;

revoke all on function public.approve_web_login_challenge(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_web_login_challenge(uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_web_login_challenge(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.consume_web_login_challenge(uuid, text)
  to service_role;

commit;