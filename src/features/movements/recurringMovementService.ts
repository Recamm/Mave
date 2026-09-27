import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';
import type { Movement } from './movementService';
import type { MovementInput } from './movementInput';
import { getOccurrenceDate, type RecurrenceUnit } from './recurrence';

type RecurringMovementRow = Database['public']['Tables']['recurring_movements']['Row'];
type MovementClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type MovementClientProvider = () => MovementClient | null;

export type RecurringMovement = Omit<RecurringMovementRow, 'amount'> & {
  amount: string;
  nextDueOn: string;
};

export type RecurringMovementInput = MovementInput & {
  intervalCount: number;
  intervalUnit: RecurrenceUnit;
  reminderDaysBefore: number;
  reminderEnabled: boolean;
  reminderEveryDays: number;
  timeZone: string;
};

const recurringMovementFields =
  'active,amount,amount_text,category_id,created_at,currency,financial_account_id,id,interval_count,interval_unit,kind,last_notified_on,note,occurrence_index,reminder_days_before,reminder_enabled,reminder_every_days,starts_on,time_zone,updated_at,user_id' as const;

function mapRecurringMovement(row: RecurringMovementRow): RecurringMovement {
  return {
    ...row,
    amount: row.amount_text,
    nextDueOn: getOccurrenceDate(
      row.starts_on,
      row.occurrence_index,
      row.interval_count,
      row.interval_unit,
    ),
  };
}

export function createRecurringMovementService(
  clientProvider: MovementClientProvider = getSupabaseClient,
) {
  function requireClient(): MovementClient {
    const client = clientProvider();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }
    return client;
  }

  return {
    async list(): Promise<RecurringMovement[]> {
      const { data, error } = await requireClient()
        .from('recurring_movements')
        .select(recurringMovementFields)
        .order('active', { ascending: false })
        .order('starts_on', { ascending: true });

      if (error) {
        throw error;
      }

      return data.map(mapRecurringMovement);
    },

    async create(input: RecurringMovementInput): Promise<RecurringMovement> {
      const { data, error } = await requireClient()
        .from('recurring_movements')
        .insert({
          active: true,
          amount: input.amount,
          category_id: input.categoryId,
          currency: input.currency,
          financial_account_id: input.financialAccountId,
          interval_count: input.intervalCount,
          interval_unit: input.intervalUnit,
          kind: input.kind,
          note: input.note,
          reminder_days_before: input.reminderDaysBefore,
          reminder_enabled: input.reminderEnabled,
          reminder_every_days: input.reminderEveryDays,
          starts_on: input.occurredOn,
          time_zone: input.timeZone,
        })
        .select(recurringMovementFields)
        .single();

      if (error) {
        throw error;
      }

      return mapRecurringMovement(data);
    },

    async setActive(id: string, active: boolean): Promise<RecurringMovement> {
      const { data, error } = await requireClient()
        .from('recurring_movements')
        .update({ active })
        .eq('id', id)
        .select(recurringMovementFields)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Recurring movement is unavailable.');
      }

      return mapRecurringMovement(data);
    },

    async setReminderEnabled(id: string, reminderEnabled: boolean): Promise<RecurringMovement> {
      const { data, error } = await requireClient()
        .from('recurring_movements')
        .update({ reminder_enabled: reminderEnabled })
        .eq('id', id)
        .select(recurringMovementFields)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Recurring movement is unavailable.');
      }

      return mapRecurringMovement(data);
    },

    async markPaid(
      recurringMovementId: string,
      occurrenceIndex: number,
      paidOn: string,
      operationId: string,
    ): Promise<Movement> {
      const { data, error } = await requireClient().rpc('mark_recurring_movement_paid', {
        p_expected_occurrence_index: occurrenceIndex,
        p_operation_id: operationId,
        p_paid_on: paidOn,
        p_recurring_movement_id: recurringMovementId,
      });

      if (error) {
        throw error;
      }

      const result = data as unknown as { movement?: unknown; status?: string };
      if (result.status === 'blocked') {
        throw new Error('La cuenta no admite cambios hasta que se resuelva su eliminación.');
      }
      if (result.status === 'stale') {
        throw new Error(
          'La recurrencia cambió en otro dispositivo. Actualiza e inténtalo de nuevo.',
        );
      }
      if (result.status === 'inactive') {
        throw new Error('Esta recurrencia está pausada.');
      }
      if (result.status !== 'applied' && result.status !== 'already-paid') {
        throw new Error('No se pudo registrar el pago recurrente.');
      }

      return mapPaidMovement(result.movement);
    },
  };
}

export const recurringMovementService = createRecurringMovementService();

function mapPaidMovement(value: unknown): Movement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Recurring payment returned an invalid movement.');
  }

  const row = value as Record<string, unknown>;
  if (typeof row.amount_text !== 'string') {
    throw new Error('Recurring payment returned an invalid amount.');
  }

  return { ...row, amount: row.amount_text, syncStatus: 'synced' } as Movement;
}
