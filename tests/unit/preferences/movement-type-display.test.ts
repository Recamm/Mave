import { afterEach, describe, expect, it } from 'vitest';
import {
  getMovementTypeDisplayPreference,
  getMovementTypeLabel,
  saveMovementTypeDisplayPreference,
} from '../../../src/app/movementTypeDisplay';

describe('movement type display preference', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to words', () => {
    expect(getMovementTypeDisplayPreference()).toBe('words');
  });

  it('persists the selected display format', () => {
    saveMovementTypeDisplayPreference('symbols');

    expect(getMovementTypeDisplayPreference()).toBe('symbols');
  });

  it('falls back to words for invalid stored values', () => {
    window.localStorage.setItem('mave.movement-type-display', 'emoji');

    expect(getMovementTypeDisplayPreference()).toBe('words');
  });

  it.each([
    ['income', 'words', 'Ingreso'],
    ['expense', 'words', 'Egreso'],
    ['income', 'symbols', '+'],
    ['expense', 'symbols', '-'],
  ] as const)('formats %s as %s', (kind, preference, expected) => {
    expect(getMovementTypeLabel(kind, preference)).toBe(expected);
  });
});
