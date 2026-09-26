import { getSupabaseClient } from '../../lib/supabase/client';
import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';
import type { Database } from '../../lib/supabase/database.types';

type TransferRow = Database['public']['Tables']['transfers']['Row'];
type TransferSelectRow = Pick<
  TransferRow,
  | 'amount_text'
  | 'client_operation_id'
  | 'created_at'
  | 'destination_account_id'
  | 'id'
  | 'occurred_on'
  | 'source_account_id'
  | 'user_id'
>;
type TransferClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type TransferClientProvider = () => TransferClient | null;

export type Transfer = Omit<TransferSelectRow, 'amount_text'> & { amount: string };

export type TransferInput = {
  amount: string;
  destinationAccountId: string;
  occurredOn: string;
  operationId: string;
  sourceAccountId: string;
};

export class TransferInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferInputError';
  }
}

const transferFields =
  'id,amount_text,client_operation_id,created_at,destination_account_id,occurred_on,source_account_id,user_id' as const;
const transferPageSize = 500;

function mapTransfer(row: TransferSelectRow): Transfer {
  const { amount_text: amount, ...transfer } = row;
  return { ...transfer, amount };
}

function normalizeTransferInput(input: TransferInput) {
  if (!input.sourceAccountId || !input.destinationAccountId) {
    throw new TransferInputError('Selecciona las cuentas de origen y destino.');
  }

  if (input.sourceAccountId === input.destinationAccountId) {
    throw new TransferInputError('El origen y el destino deben ser cuentas distintas.');
  }

  let amount;
  try {
    amount = parseDecimal(input.amount);
  } catch {
    throw new TransferInputError('Ingresa un importe positivo de hasta dos decimales.');
  }

  if (!amount.gt('0')) {
    throw new TransferInputError('Ingresa un importe positivo de hasta dos decimales.');
  }

  if (!isValidCivilDate(input.occurredOn)) {
    throw new TransferInputError('Ingresa una fecha válida.');
  }

  if (!input.operationId) {
    throw new TransferInputError('No se pudo identificar la operación. Inténtalo de nuevo.');
  }

  return { ...input, amount: serializeDecimal(amount) };
}

function isValidCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function createTransferService(clientProvider: TransferClientProvider = getSupabaseClient) {
  function requireClient(): TransferClient {
    const client = clientProvider();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listTransfers(): Promise<Transfer[]> {
      const client = requireClient();
      const rows: TransferSelectRow[] = [];
      let page = 0;

      while (true) {
        const from = page * transferPageSize;
        const { data, error } = await client
          .from('transfers')
          .select(transferFields)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + transferPageSize - 1);

        if (error) {
          throw error;
        }

        rows.push(...data);
        if (data.length < transferPageSize) {
          break;
        }

        page += 1;
      }

      return rows.map(mapTransfer);
    },

    async recordTransfer(input: TransferInput): Promise<Transfer> {
      const normalized = normalizeTransferInput(input);
      const { data, error } = await requireClient().rpc('record_transfer', {
        p_amount: normalized.amount,
        p_destination_account_id: normalized.destinationAccountId,
        p_occurred_on: normalized.occurredOn,
        p_operation_id: normalized.operationId,
        p_source_account_id: normalized.sourceAccountId,
      });

      if (error) {
        throw error;
      }

      return mapTransfer(data);
    },
  };
}

export const transferService = createTransferService();
