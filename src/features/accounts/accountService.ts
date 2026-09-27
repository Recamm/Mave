import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';

type AccountRow = Database['public']['Tables']['financial_accounts']['Row'];
type AccountSelectRow = Pick<
  AccountRow,
  'archived_at' | 'created_at' | 'currency' | 'id' | 'kind' | 'name' | 'opening_balance_text'
>;
type AccountClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type AccountClientProvider = () => AccountClient | null;

export type FinancialAccount = Pick<
  AccountRow,
  'archived_at' | 'currency' | 'id' | 'kind' | 'name'
> & {
  createdAt: string;
  openingBalance: string | null;
};

export type FinancialAccountInput = Pick<AccountRow, 'currency' | 'kind' | 'name'> & {
  openingBalance: string;
};

export class FinancialAccountInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinancialAccountInputError';
  }
}

const accountFields = 'id,name,kind,currency,opening_balance_text,created_at,archived_at' as const;

function mapAccount(row: AccountSelectRow): FinancialAccount {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    archived_at: row.archived_at,
    openingBalance: row.opening_balance_text,
    createdAt: row.created_at,
  };
}

function normalizeAccountInput(input: FinancialAccountInput) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new FinancialAccountInputError('El nombre debe tener entre 1 y 80 caracteres.');
  }

  let openingBalance: string | null = null;
  if (input.openingBalance.trim()) {
    try {
      openingBalance = serializeDecimal(parseDecimal(input.openingBalance.trim()));
    } catch {
      throw new FinancialAccountInputError(
        'Ingresa un saldo inicial válido de hasta dos decimales.',
      );
    }
  }

  return { name, kind: input.kind, currency: input.currency, opening_balance: openingBalance };
}

export function createAccountService(clientProvider: AccountClientProvider = getSupabaseClient) {
  function requireClient(): AccountClient {
    const client = clientProvider();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<
      FinancialAccount[]
    > {
      const accountQuery = requireClient().from('financial_accounts').select(accountFields);
      const query = includeArchived ? accountQuery : accountQuery.is('archived_at', null);
      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return data.map(mapAccount);
    },

    async createAccount(input: FinancialAccountInput): Promise<FinancialAccount> {
      const { data, error } = await requireClient()
        .from('financial_accounts')
        .insert(normalizeAccountInput(input))
        .select(accountFields)
        .single();

      if (error) {
        throw error;
      }

      return mapAccount(data);
    },

    async archiveAccount(id: string): Promise<void> {
      const { data, error } = await requireClient()
        .from('financial_accounts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .is('archived_at', null)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Financial account is unavailable.');
      }
    },

    async restoreAccount(id: string): Promise<void> {
      const { data, error } = await requireClient()
        .from('financial_accounts')
        .update({ archived_at: null })
        .eq('id', id)
        .not('archived_at', 'is', null)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Financial account is unavailable.');
      }
    },

    async permanentlyDeleteArchivedAccount(
      id: string,
    ): Promise<'deleted' | 'referenced' | 'unavailable'> {
      const { data, error } = await requireClient().rpc('delete_archived_financial_account', {
        p_account_id: id,
      });

      if (error) {
        throw error;
      }

      return data;
    },
  };
}

export const accountService = createAccountService();
