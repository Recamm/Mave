begin;

alter table public.financial_accounts
  add column archived_at timestamptz;

grant update (archived_at) on public.financial_accounts to authenticated;

grant delete on public.goals to authenticated;

create policy goals_owner_delete on public.goals
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;