begin;

create function public.delete_archived_financial_account(p_account_id uuid)
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

revoke all on function public.delete_archived_financial_account(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_archived_financial_account(uuid) to authenticated;

commit;