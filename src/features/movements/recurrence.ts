export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export type RecurrenceDraft = {
  intervalCount: string;
  intervalUnit: string;
  reminderDaysBefore: string;
  reminderEnabled: boolean;
  reminderEveryDays: string;
};

export type RecurrenceSettings = {
  intervalCount: number;
  intervalUnit: RecurrenceUnit;
  reminderDaysBefore: number;
  reminderEnabled: boolean;
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
    reminderEveryDays: '1',
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

  return {
    intervalCount: parseWholeNumber(
      draft.intervalCount,
      1,
      365,
      'La frecuencia debe estar entre 1 y 365.',
    ),
    intervalUnit: draft.intervalUnit,
    reminderDaysBefore: draft.reminderEnabled
      ? parseWholeNumber(
          draft.reminderDaysBefore,
          0,
          365,
          'La anticipación debe estar entre 0 y 365 días.',
        )
      : 7,
    reminderEnabled: draft.reminderEnabled,
    reminderEveryDays: draft.reminderEnabled
      ? parseWholeNumber(
          draft.reminderEveryDays,
          1,
          365,
          'La repetición debe estar entre 1 y 365 días.',
        )
      : 1,
  };
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
