import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';

export type MovementKind = 'income' | 'expense';
export type MovementCurrency = 'ARS' | 'USD';

export type MovementDraft = {
  amount: string;
  categoryId: string;
  currency: string;
  financialAccountId: string;
  kind: string;
  note: string;
  occurredOn: string;
};

export type MovementInput = {
  amount: string;
  categoryId: string;
  currency: MovementCurrency;
  financialAccountId: string | null;
  kind: MovementKind;
  note: string | null;
  occurredOn: string;
};

export type MovementInputErrorCode = 'amount' | 'category' | 'currency' | 'date' | 'kind';

const inputErrorMessages: Record<MovementInputErrorCode, string> = {
  amount: 'Ingresa un importe positivo de hasta 2 decimales.',
  category: 'Selecciona una categoría activa.',
  currency: 'Selecciona ARS o USD.',
  date: 'Ingresa una fecha válida.',
  kind: 'Selecciona ingreso o gasto.',
};

export class MovementInputError extends Error {
  constructor(readonly code: MovementInputErrorCode) {
    super(inputErrorMessages[code]);
    this.name = 'MovementInputError';
  }
}

export function createMovementDefaults(now: Date = new Date()): MovementDraft {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    amount: '',
    categoryId: '',
    currency: 'ARS',
    financialAccountId: '',
    kind: 'expense',
    note: '',
    occurredOn: `${year}-${month}-${day}`,
  };
}

export function normalizeMovementInput(draft: MovementDraft): MovementInput {
  if (draft.kind !== 'income' && draft.kind !== 'expense') {
    throw new MovementInputError('kind');
  }

  if (draft.currency !== 'ARS' && draft.currency !== 'USD') {
    throw new MovementInputError('currency');
  }

  let amount;
  try {
    amount = parseDecimal(draft.amount);
  } catch {
    throw new MovementInputError('amount');
  }

  if (!amount.gt('0')) {
    throw new MovementInputError('amount');
  }

  if (!draft.categoryId.trim()) {
    throw new MovementInputError('category');
  }

  if (!isValidCivilDate(draft.occurredOn)) {
    throw new MovementInputError('date');
  }

  return {
    amount: serializeDecimal(amount),
    categoryId: draft.categoryId,
    currency: draft.currency,
    financialAccountId: draft.financialAccountId.trim() || null,
    kind: draft.kind,
    note: draft.note.trim() || null,
    occurredOn: draft.occurredOn,
  };
}

function isValidCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match || match[0] !== value) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}
