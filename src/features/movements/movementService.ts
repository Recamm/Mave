import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import type { MovementInput } from './movementInput';

type MovementRow = Database['public']['Tables']['movements']['Row'];
type FinancialAccountRow = Database['public']['Tables']['financial_accounts']['Row'];
type MovementSelectRow = Pick<
  MovementRow,
  | 'amount_text'
  | 'category_id'
  | 'created_at'
  | 'currency'
  | 'deleted_at'
  | 'financial_account_id'
  | 'id'
  | 'kind'
  | 'note'
  | 'occurred_on'
  | 'updated_at'
  | 'user_id'
  | 'version'
>;

export type Movement = Pick<
  MovementRow,
  | 'category_id'
  | 'created_at'
  | 'currency'
  | 'deleted_at'
  | 'financial_account_id'
  | 'id'
  | 'kind'
  | 'note'
  | 'occurred_on'
  | 'updated_at'
  | 'user_id'
  | 'version'
> & { amount: string; syncStatus?: MovementSyncStatus };

export type MovementSyncStatus =
  'synced' | 'pending' | 'sending' | 'retry' | 'conflict' | 'blocked';

export type FinancialAccountOption = Pick<
  FinancialAccountRow,
  'archived_at' | 'currency' | 'id' | 'name'
>;

type MovementClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type MovementClientProvider = () => MovementClient | null;

const movementFields =
  'id,amount_text,category_id,created_at,currency,deleted_at,financial_account_id,kind,note,occurred_on,updated_at,user_id,version' as const;
const movementPageSize = 500;

function mapMovement(row: MovementSelectRow): Movement {
  const { amount_text: amount, ...movement } = row;
  return { ...movement, amount, syncStatus: 'synced' };
}

export function createMovementService(clientProvider: MovementClientProvider = getSupabaseClient) {
  function requireClient(): MovementClient {
    const client = clientProvider();

    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listFinancialAccounts(): Promise<FinancialAccountOption[]> {
      const { data, error } = await requireClient()
        .from('financial_accounts')
        .select('id,name,currency,archived_at')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return data;
    },

    async listMovements(): Promise<Movement[]> {
      const client = requireClient();
      const rows: MovementSelectRow[] = [];
      let page = 0;

      while (true) {
        const from = page * movementPageSize;
        const { data, error } = await client
          .from('movements')
          .select(movementFields)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, from + movementPageSize - 1);

        if (error) {
          throw error;
        }

        rows.push(...data);
        if (data.length < movementPageSize) {
          break;
        }

        page += 1;
      }

      return rows
        .map(mapMovement)
        .sort(
          (left, right) =>
            right.occurred_on.localeCompare(left.occurred_on) ||
            right.created_at.localeCompare(left.created_at) ||
            left.id.localeCompare(right.id),
        );
    },

    async createMovement(input: MovementInput): Promise<Movement> {
      const { data, error } = await requireClient()
        .from('movements')
        .insert({
          amount: input.amount,
          category_id: input.categoryId,
          currency: input.currency,
          financial_account_id: input.financialAccountId,
          kind: input.kind,
          note: input.note,
          occurred_on: input.occurredOn,
        })
        .select(movementFields)
        .single();

      if (error) {
        throw error;
      }

      return mapMovement(data);
    },

    async updateMovement(id: string, input: MovementInput): Promise<Movement> {
      const { data, error } = await requireClient()
        .from('movements')
        .update({
          amount: input.amount,
          category_id: input.categoryId,
          currency: input.currency,
          financial_account_id: input.financialAccountId,
          kind: input.kind,
          note: input.note,
          occurred_on: input.occurredOn,
        })
        .eq('id', id)
        .is('deleted_at', null)
        .select(movementFields)
        .single();

      if (error) {
        throw error;
      }

      return mapMovement(data);
    },

    async deleteMovement(id: string): Promise<void> {
      const { data, error } = await requireClient()
        .from('movements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Movement is unavailable.');
      }
    },
  };
}

export const movementService = createMovementService();
