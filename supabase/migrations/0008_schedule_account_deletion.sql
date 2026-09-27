begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

alter table public.account_lifecycle
  add column deletion_worker_lease_until timestamptz;

create function public.claim_expired_account_deletions(p_batch_size integer default 100)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'Batch size must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select lifecycle.user_id
    from public.account_lifecycle as lifecycle
    where lifecycle.deletion_requested_at is not null
      and lifecycle.deletion_canceled_at is null
      and lifecycle.deletion_due_at <= statement_timestamp()
      and (
        lifecycle.deletion_worker_lease_until is null
        or lifecycle.deletion_worker_lease_until <= statement_timestamp()
      )
    order by lifecycle.deletion_due_at, lifecycle.user_id
    limit p_batch_size
    for update skip locked
  ), claimed as (
    update public.account_lifecycle as lifecycle
    set deletion_started_at = coalesce(lifecycle.deletion_started_at, statement_timestamp()),
        deletion_worker_lease_until = statement_timestamp() + interval '5 minutes'
    from eligible
    where lifecycle.user_id = eligible.user_id
    returning lifecycle.user_id
  )
  select claimed.user_id from claimed;
end;
$$;

create function public.release_expired_account_deletion_claim(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  update public.account_lifecycle
  set deletion_worker_lease_until = null
  where user_id = p_user_id
    and deletion_requested_at is not null
    and deletion_canceled_at is null
    and deletion_due_at <= statement_timestamp()
    and deletion_started_at is not null;
end;
$$;

revoke all on function public.claim_expired_account_deletions(integer)
  from public, anon, authenticated;
revoke all on function public.release_expired_account_deletion_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_expired_account_deletions(integer) to service_role;
grant execute on function public.release_expired_account_deletion_claim(uuid) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-expired-account-deletions';

select cron.schedule(
  'process-expired-account-deletions',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'account_deletion_project_url'
      ) || '/functions/v1/process-expired-account-deletions',
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