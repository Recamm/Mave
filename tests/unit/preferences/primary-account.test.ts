import { afterEach, describe, expect, it } from 'vitest';
import {
  getPrimaryAccountId,
  savePrimaryAccountId,
} from '../../../src/features/accounts/primaryAccountPreference';

const accounts = [{ id: 'account-a' }, { id: 'account-b' }];

describe('primary account preference', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to the first account when no preference is saved', () => {
    expect(getPrimaryAccountId('owner-a', accounts)).toBe('account-a');
  });

  it('restores a saved account for its owner', () => {
    savePrimaryAccountId('owner-a', 'account-b');

    expect(getPrimaryAccountId('owner-a', accounts)).toBe('account-b');
    expect(getPrimaryAccountId('owner-b', accounts)).toBe('account-a');
  });

  it('falls back when the saved account is no longer available', () => {
    savePrimaryAccountId('owner-a', 'deleted-account');

    expect(getPrimaryAccountId('owner-a', accounts)).toBe('account-a');
  });
});
