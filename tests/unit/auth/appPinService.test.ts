import { describe, expect, it } from 'vitest';
import { appPinService, createAppPinService } from '../../../src/features/auth/appPinService';

describe('app PIN service', () => {
  it('stores a salted verifier per user and checks the PIN', async () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    };
    const service = createAppPinService(
      () => storage,
      () => globalThis.crypto,
    );

    await service.setPin('user-a', '482916');

    expect(service.isEnabled('user-a')).toBe(true);
    expect(await service.verifyPin('user-a', '482916')).toBe(true);
    expect(await service.verifyPin('user-a', '000000')).toBe(false);
    expect(service.isEnabled('user-b')).toBe(false);
    expect([...records.values()].join()).not.toContain('482916');

    service.clearPin('user-a');
    expect(service.isEnabled('user-a')).toBe(false);
  });

  it('rejects PINs that are not six digits', async () => {
    await expect(appPinService.setPin('user-a', '12345')).rejects.toThrow('six digits');
  });
});
