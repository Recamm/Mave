export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export type ReminderFrequency = 'once' | 'daily';

export const reminderLeadOptions = [
  { days: 1, label: '1 día antes' },
  { days: 3, label: '3 días antes' },
  { days: 7, label: '1 semana antes' },
  { days: 14, label: '2 semanas antes' },
  { days: 30, label: '1 mes antes' },
] as const;

export type RecurrenceDraft = {
  intervalCount: string;
  intervalUnit: string;
  reminderDaysBefore: string;
  reminderEnabled: boolean;
  reminderFrequency: ReminderFrequency;
};

export type RecurrenceSettings = {
  intervalCount: number;
  intervalUnit: RecurrenceUnit;
  reminderDaysBefore: number;
  reminderEnabled: boolean;
  reminderFrequency: ReminderFrequency;
  reminderEveryDays: number;
};

export class RecurrenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceInputError';
  }
}

export function createRecurrenceDraft(): RecurrenceDraft {
  return {
    intervalCount: '1',
    intervalUnit: 'month',
    reminderDaysBefore: '7',
    reminderEnabled: false,
    reminderFrequency: 'daily',
  };
}

export function normalizeRecurrenceSettings(draft: RecurrenceDraft): RecurrenceSettings {
  if (
    draft.intervalUnit !== 'day' &&
    draft.intervalUnit !== 'week' &&
    draft.intervalUnit !== 'month' &&
    draft.intervalUnit !== 'year'
  ) {
    throw new RecurrenceInputError('Selecciona cada cuánto se repite.');
  }

  const intervalCount = parseWholeNumber(
    draft.intervalCount,
    1,
    365,
    'La frecuencia debe estar entre 1 y 365.',
  );
  const reminderDaysBefore = draft.reminderEnabled
    ? parseWholeNumber(draft.reminderDaysBefore, 1, 30, 'Selecciona una anticipación válida.')
    : 7;

  if (
    draft.reminderEnabled &&
    !reminderLeadOptions.some((option) => option.days === reminderDaysBefore)
  ) {
    throw new RecurrenceInputError('Selecciona una anticipación válida.');
  }
  if (
    draft.reminderEnabled &&
    draft.reminderFrequency !== 'once' &&
    draft.reminderFrequency !== 'daily'
  ) {
    throw new RecurrenceInputError('Selecciona la frecuencia del aviso.');
  }

  const reminderFrequency = draft.reminderEnabled ? draft.reminderFrequency : 'daily';

  return {
    intervalCount,
    intervalUnit: draft.intervalUnit,
    reminderDaysBefore,
    reminderEnabled: draft.reminderEnabled,
    reminderFrequency,
    reminderEveryDays: reminderFrequency === 'once' ? reminderDaysBefore + 1 : 1,
  };
}

export function getReminderFrequency(
  daysBefore: number,
  everyDays: number,
): ReminderFrequency | 'custom' {
  if (everyDays === 1) {
    return 'daily';
  }
  return everyDays === daysBefore + 1 ? 'once' : 'custom';
}

export function getOccurrenceDate(
  startsOn: string,
  occurrenceIndex: number,
  interval: number,
  unit: RecurrenceUnit,
): string {
  const { year, month, day } = parseCivilDate(startsOn);
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new RangeError('Occurrence index must be a non-negative integer.');
  }
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError('Recurrence interval must be a positive integer.');
  }

  if (unit === 'month' || unit === 'year') {
    const monthOffset = interval * occurrenceIndex * (unit === 'year' ? 12 : 1);
    const absoluteMonth = year * 12 + month - 1 + monthOffset;
    const targetYear = Math.floor(absoluteMonth / 12);
    const targetMonth = (absoluteMonth % 12) + 1;
    const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
    return formatCivilDate(targetYear, targetMonth, targetDay);
  }

  const dayOffset = interval * occurrenceIndex * (unit === 'week' ? 7 : 1);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return formatCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getReminderStartDate(dueOn: string, daysBefore: number): string {
  if (!Number.isInteger(daysBefore) || daysBefore < 0) {
    throw new RangeError('Reminder lead time must be a non-negative integer.');
  }
  const { year, month, day } = parseCivilDate(dueOn);
  const date = new Date(Date.UTC(year, month - 1, day - daysBefore));
  return formatCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseCivilDate(value: string): { day: number; month: number; year: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError('Date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('Date is not a valid calendar date.');
  }
  return { day, month, year };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseWholeNumber(
  value: string,
  minimum: number,
  maximum: number,
  message: string,
): number {
  if (!value.trim()) {
    throw new RecurrenceInputError(message);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RecurrenceInputError(message);
  }
  return parsed;
}
