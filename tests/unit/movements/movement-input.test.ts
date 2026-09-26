import { describe, expect, it } from 'vitest';
import {
  createMovementDefaults,
  normalizeMovementInput,
  type MovementDraft,
} from '../../../src/features/movements/movementInput';

const localDate = new Date(2026, 8, 26, 0, 15);

function validDraft(overrides: Partial<MovementDraft> = {}): MovementDraft {
  return {
    ...createMovementDefaults(localDate),
    amount: '1250.50',
    categoryId: 'category-id',
    ...overrides,
  };
}

describe('movement input', () => {
  it('proposes the local date and ARS by default', () => {
    expect(createMovementDefaults(localDate)).toMatchObject({
      currency: 'ARS',
      occurredOn: '2026-09-26',
    });
  });

  it('accepts an edited civil date', () => {
    expect(normalizeMovementInput(validDraft({ occurredOn: '2026-09-25' })).occurredOn).toBe(
      '2026-09-25',
    );
  });

  it('accepts only positive amounts in ARS or USD', () => {
    expect(normalizeMovementInput(validDraft({ amount: '0.01', currency: 'USD' }))).toMatchObject({
      amount: '0.01',
      currency: 'USD',
    });

    for (const amount of ['0', '-0.01', '1.000']) {
      expect(() => normalizeMovementInput(validDraft({ amount }))).toThrow();
    }

    expect(() => normalizeMovementInput(validDraft({ currency: 'EUR' }))).toThrow();
  });
});
