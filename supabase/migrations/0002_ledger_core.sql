begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  source text not null default 'custom' check (source in ('default', 'custom')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_valid check (name = btrim(name) and char_length(name) between 1 and 80),
  constraint categories_user_id_id_key unique (user_id, id)
);

create unique index categories_active_name_key
  on public.categories (user_id, lower(name))
  where archived_at is null;

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'wallet', 'other')),
  currency text not null check (currency in ('ARS', 'USD')),
  opening_balance numeric,
  opening_balance_text text generated always as (opening_balance::text) stored,
  created_at timestamptz not null default now(),
  constraint financial_accounts_name_valid check (name = btrim(name) and char_length(name) between 1 and 80),
  constraint financial_accounts_opening_balance_scale check (
    opening_balance is null or scale(opening_balance) <= 2
  ),
  constraint financial_accounts_user_id_id_key unique (user_id, id),
  constraint financial_accounts_user_id_id_currency_key unique (user_id, id, currency)
);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  currency text not null check (currency in ('ARS', 'USD')),
  category_id uuid not null,
  occurred_on date not null,
  financial_account_id uuid,
  note text,
  version integer not null default 1 check (version > 0),
  client_operation_id uuid not null default gen_random_uuid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movements_amount_valid check (amount > 0 and scale(amount) <= 2),
  constraint movements_note_length check (note is null or char_length(note) <= 2000),
  constraint movements_user_id_id_key unique (user_id, id),
  constraint movements_user_operation_key unique (user_id, client_operation_id),
  constraint movements_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict,
  constraint movements_account_owner_currency_fkey foreign key (user_id, financial_account_id, currency)
    references public.financial_accounts (user_id, id, currency) on delete restrict
);

create index movements_owner_date_idx
  on public.movements (user_id, occurred_on desc, created_at desc)
  where deleted_at is null;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_account_id uuid not null,
  destination_account_id uuid not null,
  amount numeric not null,
  amount_text text generated always as (amount::text) stored,
  occurred_on date not null,
  client_operation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint transfers_amount_valid check (amount > 0 and scale(amount) <= 2),
  constraint transfers_accounts_distinct check (source_account_id <> destination_account_id),
  constraint transfers_user_id_id_key unique (user_id, id),
  constraint transfers_user_operation_key unique (user_id, client_operation_id),
  constraint transfers_source_owner_fkey foreign key (user_id, source_account_id)
    references public.financial_accounts (user_id, id) on delete restrict,
  constraint transfers_destination_owner_fkey foreign key (user_id, destination_account_id)
    references public.financial_accounts (user_id, id) on delete restrict
);

create index transfers_owner_date_idx
  on public.transfers (user_id, occurred_on desc, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger movements_set_updated_at
before update on public.movements
for each row execute function public.set_updated_at();

create function public.ensure_active_movement_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  category_is_active boolean;
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select archived_at is null
      into category_is_active
      from public.categories
      where user_id = new.user_id and id = new.category_id;

    if category_is_active is distinct from true then
      raise exception 'Movement category is unavailable for new assignments.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger movements_require_active_category
before insert or update on public.movements
for each row execute function public.ensure_active_movement_category();

create function public.ensure_transfer_account_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_currency text;
  destination_currency text;
begin
  select currency
    into source_currency
    from public.financial_accounts
    where user_id = new.user_id and id = new.source_account_id;

  select currency
    into destination_currency
    from public.financial_accounts
    where user_id = new.user_id and id = new.destination_account_id;

  if source_currency is null or destination_currency is null then
    raise exception 'Transfer accounts must belong to the authenticated owner.'
      using errcode = '23503';
  end if;

  if source_currency <> destination_currency then
    raise exception 'Transfer accounts must use the same currency.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger transfers_require_matching_currency
before insert or update on public.transfers
for each row execute function public.ensure_transfer_account_currency();

create function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, source)
  values
    (new.id, 'Alimentación', 'default'),
    (new.id, 'Vivienda', 'default'),
    (new.id, 'Transporte', 'default'),
    (new.id, 'Salud', 'default'),
    (new.id, 'Educación', 'default'),
    (new.id, 'Servicios', 'default'),
    (new.id, 'Compras', 'default'),
    (new.id, 'Entretenimiento', 'default'),
    (new.id, 'Ingresos', 'default'),
    (new.id, 'Otros', 'default')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_active_movement_category() from public, anon, authenticated;
revoke all on function public.ensure_transfer_account_currency() from public, anon, authenticated;
revoke all on function public.seed_default_categories() from public, anon, authenticated;

create trigger auth_user_seed_default_categories
after insert on auth.users
for each row execute function public.seed_default_categories();

alter table public.categories enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.movements enable row level security;
alter table public.transfers enable row level security;

revoke all on public.categories, public.financial_accounts, public.movements, public.transfers
  from anon, authenticated;

grant select, insert, update on public.categories to authenticated;
grant select, insert on public.financial_accounts to authenticated;
grant select, insert, update on public.movements to authenticated;
grant select, insert on public.transfers to authenticated;

create policy categories_owner_access on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy financial_accounts_owner_access on public.financial_accounts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy movements_owner_access on public.movements
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy transfers_owner_access on public.transfers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;