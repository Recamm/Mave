begin;

alter table public.financial_accounts
  add constraint financial_accounts_opening_balance_finite check (
    opening_balance is null
    or opening_balance::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.movements
  add constraint movements_amount_finite check (
    amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.transfers
  add constraint transfers_amount_finite check (
    amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.refunds
  add constraint refunds_amount_finite check (
    amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.movement_conflict_revisions
  add constraint movement_conflict_revisions_amount_finite check (
    amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.transfer_operations
  add constraint transfer_operations_amount_finite check (
    amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

commit;