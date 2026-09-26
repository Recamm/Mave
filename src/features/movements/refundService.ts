import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type RefundRow = Database['public']['Tables']['refunds']['Row'];
type RefundClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type RefundClientProvider = () => RefundClient | null;

type RefundSelectRow = Pick<
  RefundRow,
  | 'amount_text'
  | 'client_operation_id'
  | 'created_at'
  | 'deleted_at'
  | 'expense_id'
  | 'id'
  | 'received_on'
  | 'updated_at'
  | 'version'
>;

export type Refund = Pick<
  RefundRow,
  | 'client_operation_id'
  | 'created_at'
  | 'deleted_at'
  | 'expense_id'
  | 'id'
  | 'received_on'
  | 'updated_at'
  | 'version'
> & { amount: string };

export type RefundAction = 'create' | 'update' | 'delete';

export type RefundOperation = {
  action: RefundAction;
  operationId: string;
  refundId: string | null;
  expenseId: string | null;
  amount: string | null;
  receivedOn: string | null;
  expectedVersion: number | null;
};

const refundFields =
  'id,amount_text,client_operation_id,created_at,deleted_at,expense_id,received_on,updated_at,version' as const;
const refundPageSize = 500;

function mapRefund(row: RefundSelectRow): Refund {
  const { amount_text: amount, ...refund } = row;
  return { ...refund, amount };
}

export function createRefundService(clientProvider: RefundClientProvider = getSupabaseClient) {
  function requireClient(): RefundClient {
    const client = clientProvider();

    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listRefunds(): Promise<Refund[]> {
      const client = requireClient();
      const rows: RefundSelectRow[] = [];
      let page = 0;

      while (true) {
        const from = page * refundPageSize;
        const { data, error } = await client
          .from('refunds')
          .select(refundFields)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, from + refundPageSize - 1);

        if (error) {
          throw error;
        }

        rows.push(...data);
        if (data.length < refundPageSize) {
          break;
        }

        page += 1;
      }

      return rows
        .map(mapRefund)
        .sort(
          (left, right) =>
            right.received_on.localeCompare(left.received_on) ||
            right.created_at.localeCompare(left.created_at) ||
            left.id.localeCompare(right.id),
        );
    },

    async recordRefund(operation: RefundOperation): Promise<Refund> {
      const { data, error } = await requireClient().rpc('record_refund', {
        p_action: operation.action,
        p_operation_id: operation.operationId,
        p_refund_id: operation.refundId,
        p_expense_id: operation.expenseId,
        p_amount: operation.amount,
        p_received_on: operation.receivedOn,
        p_expected_version: operation.expectedVersion,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Refund result is unavailable.');
      }

      return mapRefund(data);
    },
  };
}

export const refundService = createRefundService();
