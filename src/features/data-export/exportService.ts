import { getSupabaseClient } from '../../lib/supabase/client';

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;
type ClientProvider = () => Client | null;

type ExportAccount = {
  created_at: string;
  currency: 'ARS' | 'USD';
  id: string;
  kind: 'bank' | 'cash' | 'other' | 'wallet';
  name: string;
  opening_balance: string | null;
  user_id: string;
};

type ExportCategory = {
  archived_at: string | null;
  created_at: string;
  id: string;
  name: string;
  source: 'custom' | 'default';
  updated_at: string;
  user_id: string;
};

type ExportMovement = {
  amount: string;
  category_id: string;
  client_operation_id: string;
  created_at: string;
  currency: 'ARS' | 'USD';
  deleted_at: string | null;
  financial_account_id: string | null;
  id: string;
  kind: 'expense' | 'income';
  note: string | null;
  occurred_on: string;
  updated_at: string;
  user_id: string;
  version: number;
};

type ExportRefund = {
  amount: string;
  client_operation_id: string;
  created_at: string;
  deleted_at: string | null;
  expense_id: string;
  id: string;
  received_on: string;
  updated_at: string;
  user_id: string;
  version: number;
};

type ExportTransfer = {
  amount: string;
  client_operation_id: string;
  created_at: string;
  destination_account_id: string;
  id: string;
  occurred_on: string;
  source_account_id: string;
  user_id: string;
};

type ExportGoal = {
  created_at: string;
  currency: 'ARS' | 'USD';
  id: string;
  name: string;
  target_amount: string;
  target_date: string | null;
  user_id: string;
};

type ExportGoalContribution = {
  amount: string;
  contributed_on: string;
  created_at: string;
  goal_id: string;
  id: string;
  user_id: string;
};

export type ExportDataset = {
  accounts: ExportAccount[];
  categories: ExportCategory[];
  goal_contributions: ExportGoalContribution[];
  goals: ExportGoal[];
  movements: ExportMovement[];
  refunds: ExportRefund[];
  transfers: ExportTransfer[];
};

export type ExportFormat = 'csv' | 'json';

export type ExportFile = {
  content: string;
  filename: string;
  mimeType: string;
};

const pageSize = 500;
const csvColumns = [
  'entity_type',
  'id',
  'user_id',
  'name',
  'kind',
  'amount',
  'currency',
  'occurred_on',
  'received_on',
  'contributed_on',
  'target_date',
  'category_id',
  'financial_account_id',
  'source_account_id',
  'destination_account_id',
  'expense_id',
  'goal_id',
  'account_kind',
  'opening_balance',
  'target_amount',
  'source',
  'archived_at',
  'note',
  'version',
  'client_operation_id',
  'deleted_at',
  'created_at',
  'updated_at',
] as const;

type CsvColumn = (typeof csvColumns)[number];
type CsvRecord = Record<CsvColumn, string | number | null>;

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: unknown | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error('The export query returned no data.');
    }

    rows.push(...data);
    if (data.length < pageSize) {
      return rows;
    }

    from += pageSize;
  }
}

export function serializeExportData(dataset: ExportDataset, format: ExportFormat): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        version: 1,
        exported_at: new Date().toISOString(),
        data: dataset,
      },
      null,
      2,
    );
  }

  return serializeCsv(dataset);
}

export function createDataExportService(clientProvider: ClientProvider = getSupabaseClient) {
  return {
    async loadDataset(): Promise<ExportDataset> {
      const client = clientProvider();
      if (!client) {
        throw new Error('Supabase is not configured.');
      }

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }
      if (!sessionData.session) {
        throw new Error('An authenticated session is required to export data.');
      }

      const [
        accountRows,
        categories,
        movementRows,
        refundRows,
        transferRows,
        goalRows,
        contributionRows,
      ] = await Promise.all([
        fetchAll((from, to) =>
          client
            .from('financial_accounts')
            .select('id,user_id,name,kind,currency,opening_balance_text,created_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('categories')
            .select('id,user_id,name,source,archived_at,created_at,updated_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('movements')
            .select(
              'id,user_id,kind,amount_text,currency,category_id,occurred_on,financial_account_id,note,version,client_operation_id,deleted_at,created_at,updated_at',
            )
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('refunds')
            .select(
              'id,user_id,expense_id,amount_text,received_on,version,client_operation_id,deleted_at,created_at,updated_at',
            )
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('transfers')
            .select(
              'id,user_id,source_account_id,destination_account_id,amount_text,occurred_on,client_operation_id,created_at',
            )
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('goals')
            .select('id,user_id,name,target_amount_text,currency,target_date,created_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        fetchAll((from, to) =>
          client
            .from('goal_contributions')
            .select('id,user_id,goal_id,amount_text,contributed_on,created_at')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
      ]);

      return {
        accounts: accountRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          kind: row.kind,
          currency: row.currency,
          opening_balance: row.opening_balance_text,
          created_at: row.created_at,
        })),
        categories,
        movements: movementRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          kind: row.kind,
          amount: row.amount_text,
          currency: row.currency,
          category_id: row.category_id,
          occurred_on: row.occurred_on,
          financial_account_id: row.financial_account_id,
          note: row.note,
          version: row.version,
          client_operation_id: row.client_operation_id,
          deleted_at: row.deleted_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
        refunds: refundRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          expense_id: row.expense_id,
          amount: row.amount_text,
          received_on: row.received_on,
          version: row.version,
          client_operation_id: row.client_operation_id,
          deleted_at: row.deleted_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
        transfers: transferRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          source_account_id: row.source_account_id,
          destination_account_id: row.destination_account_id,
          amount: row.amount_text,
          occurred_on: row.occurred_on,
          client_operation_id: row.client_operation_id,
          created_at: row.created_at,
        })),
        goals: goalRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          target_amount: row.target_amount_text,
          currency: row.currency,
          target_date: row.target_date,
          created_at: row.created_at,
        })),
        goal_contributions: contributionRows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          goal_id: row.goal_id,
          amount: row.amount_text,
          contributed_on: row.contributed_on,
          created_at: row.created_at,
        })),
      };
    },

    async createExport(format: ExportFormat): Promise<ExportFile> {
      const dataset = await this.loadDataset();
      const extension = format === 'csv' ? 'csv' : 'json';
      return {
        content: serializeExportData(dataset, format),
        filename: `mave-export-${new Date().toISOString().slice(0, 10)}.${extension}`,
        mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
      };
    },
  };
}

function serializeCsv(dataset: ExportDataset): string {
  const rows: CsvRecord[] = [];

  for (const category of dataset.categories) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'category',
      id: category.id,
      user_id: category.user_id,
      name: category.name,
      source: category.source,
      archived_at: category.archived_at,
      created_at: category.created_at,
      updated_at: category.updated_at,
    });
  }
  for (const account of dataset.accounts) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'account',
      id: account.id,
      user_id: account.user_id,
      name: account.name,
      currency: account.currency,
      account_kind: account.kind,
      opening_balance: account.opening_balance,
      created_at: account.created_at,
    });
  }
  for (const movement of dataset.movements) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'movement',
      id: movement.id,
      user_id: movement.user_id,
      kind: movement.kind,
      amount: movement.amount,
      currency: movement.currency,
      occurred_on: movement.occurred_on,
      category_id: movement.category_id,
      financial_account_id: movement.financial_account_id,
      note: movement.note,
      version: movement.version,
      client_operation_id: movement.client_operation_id,
      deleted_at: movement.deleted_at,
      created_at: movement.created_at,
      updated_at: movement.updated_at,
    });
  }
  for (const refund of dataset.refunds) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'refund',
      id: refund.id,
      user_id: refund.user_id,
      amount: refund.amount,
      received_on: refund.received_on,
      expense_id: refund.expense_id,
      version: refund.version,
      client_operation_id: refund.client_operation_id,
      deleted_at: refund.deleted_at,
      created_at: refund.created_at,
      updated_at: refund.updated_at,
    });
  }
  for (const transfer of dataset.transfers) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'transfer',
      id: transfer.id,
      user_id: transfer.user_id,
      amount: transfer.amount,
      occurred_on: transfer.occurred_on,
      source_account_id: transfer.source_account_id,
      destination_account_id: transfer.destination_account_id,
      client_operation_id: transfer.client_operation_id,
      created_at: transfer.created_at,
    });
  }
  for (const goal of dataset.goals) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'goal',
      id: goal.id,
      user_id: goal.user_id,
      name: goal.name,
      currency: goal.currency,
      target_amount: goal.target_amount,
      target_date: goal.target_date,
      created_at: goal.created_at,
    });
  }
  for (const contribution of dataset.goal_contributions) {
    rows.push({
      ...emptyCsvRecord(),
      entity_type: 'goal_contribution',
      id: contribution.id,
      user_id: contribution.user_id,
      amount: contribution.amount,
      contributed_on: contribution.contributed_on,
      goal_id: contribution.goal_id,
      created_at: contribution.created_at,
    });
  }

  const records = [
    csvColumns.join(','),
    ...rows.map((row) => csvColumns.map((column) => escapeCsvCell(row[column])).join(',')),
  ];
  return `\uFEFF${records.join('\r\n')}\r\n`;
}

function emptyCsvRecord(): CsvRecord {
  return Object.fromEntries(csvColumns.map((column) => [column, null])) as CsvRecord;
}

function escapeCsvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const dataExportService = createDataExportService();
