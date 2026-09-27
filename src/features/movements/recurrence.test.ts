import { describe, expect, it } from 'vitest';
import {
  createRecurrenceDraft,
  getOccurrenceDate,
  getReminderFrequency,
  getReminderStartDate,
  normalizeRecurrenceSettings,
  reminderLeadOptions,
  RecurrenceInputError,
} from './recurrence';

describe('recurrence dates', () => {
  it('keeps monthly occurrences anchored to the original day of month', () => {
    expect(getOccurrenceDate('2026-01-31', 1, 1, 'month')).toBe('2026-02-28');
    expect(getOccurrenceDate('2026-01-31', 2, 1, 'month')).toBe('2026-03-31');
  });

  it('keeps leap-day yearly occurrences anchored to the original date', () => {
    expect(getOccurrenceDate('2024-02-29', 1, 1, 'year')).toBe('2025-02-28');
    expect(getOccurrenceDate('2024-02-29', 4, 1, 'year')).toBe('2028-02-29');
  });

  it('calculates weekly intervals and reminder lead dates as calendar days', () => {
    expect(getOccurrenceDate('2026-09-27', 2, 1, 'week')).toBe('2026-10-11');
    expect(getReminderStartDate('2026-10-11', 7)).toBe('2026-10-04');
  });

  it('rejects invalid dates and intervals', () => {
    expect(() => getOccurrenceDate('2026-02-30', 0, 1, 'month')).toThrow(RangeError);
    expect(() => getOccurrenceDate('2026-01-01', -1, 1, 'day')).toThrow(RangeError);
    expect(() => getReminderStartDate('2026-10-11', -1)).toThrow(RangeError);
  });

  it('normalizes a monthly reminder one week ahead every day', () => {
    expect(
      normalizeRecurrenceSettings({
        ...createRecurrenceDraft(),
        reminderEnabled: true,
        reminderDaysBefore: '7',
        reminderFrequency: 'daily',
      }),
    ).toEqual({
      intervalCount: 1,
      intervalUnit: 'month',
      reminderDaysBefore: 7,
      reminderEnabled: true,
      reminderFrequency: 'daily',
      reminderEveryDays: 1,
    });
  });

  it('ignores hidden reminder values when reminders are disabled', () => {
    expect(
      normalizeRecurrenceSettings({
        ...createRecurrenceDraft(),
        reminderDaysBefore: '',
        reminderFrequency: 'once',
      }),
    ).toMatchObject({
      reminderDaysBefore: 7,
      reminderEnabled: false,
      reminderFrequency: 'daily',
      reminderEveryDays: 1,
    });
  });

  it('maps a one-time reminder to a single notification at the start of the window', () => {
    const settings = normalizeRecurrenceSettings({
      ...createRecurrenceDraft(),
      reminderEnabled: true,
      reminderFrequency: 'once',
    });

    expect(settings).toMatchObject({
      reminderDaysBefore: 7,
      reminderFrequency: 'once',
      reminderEveryDays: 8,
    });
    expect(getReminderFrequency(settings.reminderDaysBefore, settings.reminderEveryDays)).toBe(
      'once',
    );
  });

  it('keeps daily and legacy custom cadences distinguishable', () => {
    expect(getReminderFrequency(7, 1)).toBe('daily');
    expect(getReminderFrequency(7, 3)).toBe('custom');
  });

  it('offers the selected notice windows in calendar-friendly units', () => {
    expect(reminderLeadOptions.map((option) => option.label)).toEqual([
      '1 día antes',
      '3 días antes',
      '1 semana antes',
      '2 semanas antes',
      '1 mes antes',
    ]);
  });

  it('rejects out-of-range recurrence and reminder intervals', () => {
    expect(() =>
      normalizeRecurrenceSettings({ ...createRecurrenceDraft(), intervalCount: '0' }),
    ).toThrow(RecurrenceInputError);
    expect(() =>
      normalizeRecurrenceSettings({
        ...createRecurrenceDraft(),
        reminderEnabled: true,
        reminderDaysBefore: '2',
      }),
    ).toThrow(RecurrenceInputError);
  });
});
