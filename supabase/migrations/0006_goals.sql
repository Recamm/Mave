begin;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  target_amount_text text generated always as (target_amount::text) stored,
  currency text not null check (currency in ('ARS', 'USD')),
  target_date date,
  created_at timestamptz not null default now(),
  constraint goals_name_valid check (name = btrim(name) and char_length(name) between 1 and 80),
  constraint goals_target_amount_valid check (
    target_amount > 0
    and target_amount::text not in ('NaN', 'Infinity', '-Infinity')
    and scale(target_amount) <= 2
  ),
  constraint goals_user_id_id_key unique (user_id, id)
);

create index goals_owner_created_idx
  on public.goals (user_id, created_at desc, id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  contributed_on date not null,
  created_at timestamptz not null default now(),
  constraint goal_contributions_amount_valid check (
    amount > 0
    and amount::text not in ('NaN', 'Infinity', '-Infinity')
    and scale(amount) <= 2
  ),
  constraint goal_contributions_user_id_id_key unique (user_id, id),
  constraint goal_contributions_goal_owner_fkey foreign key (user_id, goal_id)
    references public.goals (user_id, id) on delete cascade
);

create index goal_contributions_owner_goal_date_idx
  on public.goal_contributions (user_id, goal_id, contributed_on desc, created_at desc);

alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

revoke all on public.goals, public.goal_contributions from public, anon, authenticated;
grant select, insert on public.goals, public.goal_contributions to authenticated;

create policy goals_owner_select on public.goals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy goals_owner_insert on public.goals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy goal_contributions_owner_select on public.goal_contributions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy goal_contributions_owner_insert on public.goal_contributions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

commit;