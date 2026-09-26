import { addDecimals, parseDecimal, serializeDecimal } from '../../lib/money/decimal';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type GoalRow = Database['public']['Tables']['goals']['Row'];
type ContributionRow = Database['public']['Tables']['goal_contributions']['Row'];
type GoalSelectRow = Pick<
  GoalRow,
  'created_at' | 'currency' | 'id' | 'name' | 'target_amount_text' | 'target_date'
>;
type ContributionSelectRow = Pick<
  ContributionRow,
  'amount_text' | 'contributed_on' | 'created_at' | 'goal_id' | 'id'
>;
type GoalClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type GoalClientProvider = () => GoalClient | null;

export type GoalCurrency = 'ARS' | 'USD';

export type GoalContribution = {
  amount: string;
  contributedOn: string;
  createdAt: string;
  goalId: string;
  id: string;
};

export type SavingsGoal = {
  createdAt: string;
  contributions: GoalContribution[];
  currency: GoalCurrency;
  id: string;
  name: string;
  progress: string;
  targetAmount: string;
  targetDate: string | null;
};

export type SavingsGoalInput = {
  currency: GoalCurrency;
  name: string;
  targetAmount: string;
  targetDate: string;
};

export type GoalContributionInput = {
  amount: string;
  contributedOn: string;
  goalId: string;
};

export class GoalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoalInputError';
  }
}

const goalFields = 'id,name,target_amount_text,currency,target_date,created_at' as const;
const contributionFields = 'id,goal_id,amount_text,contributed_on,created_at' as const;

function mapGoal(row: GoalSelectRow): Omit<SavingsGoal, 'contributions' | 'progress'> {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount_text,
    currency: row.currency,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

function mapContribution(row: ContributionSelectRow): GoalContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    amount: row.amount_text,
    contributedOn: row.contributed_on,
    createdAt: row.created_at,
  };
}

function normalizeGoalInput(input: SavingsGoalInput) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new GoalInputError('El nombre debe tener entre 1 y 80 caracteres.');
  }

  if (input.currency !== 'ARS' && input.currency !== 'USD') {
    throw new GoalInputError('Selecciona ARS o USD.');
  }

  let targetAmount;
  try {
    targetAmount = parseDecimal(input.targetAmount);
  } catch {
    throw new GoalInputError('Ingresa un importe objetivo válido de hasta dos decimales.');
  }

  if (!targetAmount.gt('0')) {
    throw new GoalInputError('El importe objetivo debe ser positivo.');
  }

  const targetDate = input.targetDate.trim() || null;
  if (targetDate && !isValidCivilDate(targetDate)) {
    throw new GoalInputError('Ingresa una fecha objetivo válida.');
  }

  return {
    name,
    target_amount: serializeDecimal(targetAmount),
    currency: input.currency,
    target_date: targetDate,
  };
}

function normalizeContributionInput(input: GoalContributionInput) {
  if (!input.goalId.trim()) {
    throw new GoalInputError('No se encontró la meta para este aporte.');
  }

  let amount;
  try {
    amount = parseDecimal(input.amount);
  } catch {
    throw new GoalInputError('Ingresa un aporte positivo de hasta dos decimales.');
  }

  if (!amount.gt('0')) {
    throw new GoalInputError('El aporte debe ser positivo.');
  }

  if (!isValidCivilDate(input.contributedOn)) {
    throw new GoalInputError('Ingresa una fecha de aporte válida.');
  }

  return {
    goal_id: input.goalId,
    amount: serializeDecimal(amount),
    contributed_on: input.contributedOn,
  };
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

export function createGoalService(clientProvider: GoalClientProvider = getSupabaseClient) {
  function requireClient(): GoalClient {
    const client = clientProvider();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listGoals(): Promise<SavingsGoal[]> {
      const client = requireClient();
      const [goalsResult, contributionsResult] = await Promise.all([
        client.from('goals').select(goalFields).order('created_at', { ascending: false }),
        client
          .from('goal_contributions')
          .select(contributionFields)
          .order('contributed_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      if (goalsResult.error) {
        throw goalsResult.error;
      }
      if (contributionsResult.error) {
        throw contributionsResult.error;
      }

      const contributionsByGoalId = new Map<string, GoalContribution[]>();
      for (const row of contributionsResult.data) {
        const contribution = mapContribution(row);
        const goalContributions = contributionsByGoalId.get(contribution.goalId) ?? [];
        goalContributions.push(contribution);
        contributionsByGoalId.set(contribution.goalId, goalContributions);
      }

      return goalsResult.data.map((row) => {
        const goalContributions = contributionsByGoalId.get(row.id) ?? [];
        const progress = goalContributions.reduce(
          (total, contribution) => addDecimals(total, contribution.amount),
          '0',
        );

        return { ...mapGoal(row), contributions: goalContributions, progress };
      });
    },

    async createGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
      const { data, error } = await requireClient()
        .from('goals')
        .insert(normalizeGoalInput(input))
        .select(goalFields)
        .single();

      if (error) {
        throw error;
      }

      return { ...mapGoal(data), contributions: [], progress: '0' };
    },

    async addContribution(input: GoalContributionInput): Promise<GoalContribution> {
      const { data, error } = await requireClient()
        .from('goal_contributions')
        .insert(normalizeContributionInput(input))
        .select(contributionFields)
        .single();

      if (error) {
        throw error;
      }

      return mapContribution(data);
    },
  };
}

export const goalService = createGoalService();
