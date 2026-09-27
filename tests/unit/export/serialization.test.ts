import { describe, expect, it } from 'vitest';
import {
  serializeExportData,
  type ExportDataset,
} from '../../../src/features/data-export/exportService';

const dataset: ExportDataset = {
  accounts: [
    {
      id: 'account-1',
      user_id: 'owner-1',
      name: 'Daily account',
      kind: 'cash',
      currency: 'ARS',
      opening_balance: '1000.10',
      created_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  categories: [
    {
      id: 'category-1',
      user_id: 'owner-1',
      name: 'Food',
      source: 'default',
      archived_at: null,
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  movements: [
    {
      id: 'movement-1',
      user_id: 'owner-1',
      kind: 'expense',
      amount: '9007199254740993.01',
      currency: 'ARS',
      category_id: 'category-1',
      occurred_on: '2026-09-25',
      financial_account_id: 'account-1',
      note: 'Market, "north"',
      version: 2,
      client_operation_id: 'operation-1',
      deleted_at: null,
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  refunds: [
    {
      id: 'refund-1',
      user_id: 'owner-1',
      expense_id: 'movement-1',
      amount: '0.10',
      received_on: '2026-09-26',
      version: 1,
      client_operation_id: 'operation-2',
      deleted_at: null,
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  transfers: [
    {
      id: 'transfer-1',
      user_id: 'owner-1',
      source_account_id: 'account-1',
      destination_account_id: 'account-2',
      amount: '12.50',
      occurred_on: '2026-09-26',
      client_operation_id: 'operation-3',
      created_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  goals: [
    {
      id: 'goal-1',
      user_id: 'owner-1',
      name: 'Trip',
      target_amount: '50000.00',
      currency: 'ARS',
      target_date: '2027-01-01',
      created_at: '2026-09-26T12:00:00.000Z',
    },
  ],
  goal_contributions: [
    {
      id: 'contribution-1',
      user_id: 'owner-1',
      goal_id: 'goal-1',
      amount: '1.25',
      contributed_on: '2026-09-26',
      created_at: '2026-09-26T12:00:00.000Z',
    },
  ],
};

describe('data export serialization', () => {
  it('keeps decimal amounts as text and preserves IDs, dates, and relationships in JSON', () => {
    const exported = JSON.parse(serializeExportData(dataset, 'json')) as {
      data: ExportDataset;
    };

    expect(exported.data).toEqual(dataset);
    expect(typeof exported.data.movements[0]?.amount).toBe('string');
    expect(exported.data.movements[0]?.amount).toBe('9007199254740993.01');
    expect(exported.data.refunds[0]?.expense_id).toBe('movement-1');
    expect(exported.data.transfers[0]?.destination_account_id).toBe('account-2');
    expect(exported.data.goal_contributions[0]?.goal_id).toBe('goal-1');
    expect(exported.data.movements[0]?.occurred_on).toBe('2026-09-25');
  });

  it('writes every entity as a spreadsheet row with stable relation columns and escaped text', () => {
    const csv = serializeExportData(dataset, 'csv').replace(/^\uFEFF/, '');
    const [header, ...rows] = csv.split('\r\n').filter(Boolean);

    expect(header).toContain('entity_type,id,user_id');
    expect(header).toContain('category_id,financial_account_id');
    expect(header).toContain('source_account_id,destination_account_id,expense_id,goal_id');
    expect(rows).toHaveLength(7);
    expect(csv).toContain('movement-1,owner-1');
    expect(csv).toContain('9007199254740993.01');
    expect(csv).toContain('"Market, ""north"""');
    expect(csv).toContain('refund-1,owner-1');
    expect(csv).toContain('transfer-1,owner-1');
    expect(csv).toContain('contribution-1,owner-1');
  });
});
