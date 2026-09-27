import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createWebLoginService } from '../../../src/features/auth/webLoginService';
import type { Database } from '../../../src/lib/supabase/database.types';

function createMockClient() {
  const functions = { invoke: vi.fn() };
  const auth = { verifyOtp: vi.fn() };
  return {
    auth,
    client: { auth, functions } as unknown as SupabaseClient<Database>,
    functions,
  };
}

describe('web login service', () => {
  it('creates a request and validates its independent secrets', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({
      data: {
        approvalSecret: 'a'.repeat(64),
        expiresAt: '2026-09-27T12:03:00.000Z',
        pollSecret: 'b'.repeat(64),
        requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
      },
      error: null,
    });
    const service = createWebLoginService(() => client);

    await expect(service.start()).resolves.toMatchObject({
      approvalSecret: 'a'.repeat(64),
      pollSecret: 'b'.repeat(64),
      requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
    });
    expect(functions.invoke).toHaveBeenCalledWith('web-login', { body: { action: 'start' } });
  });

  it('exchanges an approved token hash through Supabase Auth', async () => {
    const { auth, client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({
      data: {
        email: 'person@example.invalid',
        status: 'approved',
        tokenHash: 'one-time-token-hash',
      },
      error: null,
    });
    auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    const service = createWebLoginService(() => client);

    await expect(service.poll('request-id', 'poll-secret')).resolves.toBe('authenticated');
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.invalid',
      token_hash: 'one-time-token-hash',
      type: 'magiclink',
    });
  });

  it('does not exchange a pending or expired request', async () => {
    const { auth, client, functions } = createMockClient();
    functions.invoke
      .mockResolvedValueOnce({ data: { status: 'pending' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'expired' }, error: null });
    const service = createWebLoginService(() => client);

    await expect(service.poll('request-id', 'poll-secret')).resolves.toBe('pending');
    await expect(service.poll('request-id', 'poll-secret')).resolves.toBe('expired');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
