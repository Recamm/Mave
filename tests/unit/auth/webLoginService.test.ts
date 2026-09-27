import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createWebLoginApprovalPath,
  createWebLoginService,
  parseWebLoginApprovalCode,
} from '../../../src/features/auth/webLoginService';
import type { Database } from '../../../src/lib/supabase/database.types';

const requestId = 'c22e553d-87b3-44c4-9c0d-0137c8881111';
const approvalSecret = 'a'.repeat(64);

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
  it('parses the manual approval code shown below the desktop QR', () => {
    expect(
      parseWebLoginApprovalCode(`${requestId}:${approvalSecret}`, 'https://mave.example'),
    ).toEqual({ approvalSecret, requestId });
  });

  it('parses only same-origin approval links from QR scans', () => {
    const path = createWebLoginApprovalPath({ approvalSecret, requestId });

    expect(
      parseWebLoginApprovalCode(`https://mave.example${path}`, 'https://mave.example'),
    ).toEqual({ approvalSecret, requestId });
    expect(parseWebLoginApprovalCode(`https://other.example${path}`, 'https://mave.example')).toBe(
      null,
    );
  });

  it('rejects malformed codes and URLs outside the approval route', () => {
    expect(parseWebLoginApprovalCode(`${requestId}:short`, 'https://mave.example')).toBeNull();
    expect(
      parseWebLoginApprovalCode(
        `https://mave.example/profile#request=${requestId}&approval=${approvalSecret}`,
        'https://mave.example',
      ),
    ).toBeNull();
  });

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

  it('starts a code login and validates the six-digit response', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({
      data: {
        code: '004218',
        expiresAt: '2026-09-27T12:03:00.000Z',
        pollSecret: 'b'.repeat(64),
        requestId,
      },
      error: null,
    });
    const service = createWebLoginService(() => client);

    await expect(service.startCode(' person@example.invalid ')).resolves.toEqual({
      code: '004218',
      expiresAt: '2026-09-27T12:03:00.000Z',
      pollSecret: 'b'.repeat(64),
      requestId,
    });
    expect(functions.invoke).toHaveBeenCalledWith('web-login', {
      body: { action: 'start-code', email: 'person@example.invalid' },
    });
  });

  it('lists only validated pending mobile approvals', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({
      data: {
        requests: [
          {
            createdAt: '2026-09-27T12:00:00.000Z',
            expiresAt: '2026-09-27T12:03:00.000Z',
            originHost: 'desktop.example.invalid',
            requestId,
          },
        ],
      },
      error: null,
    });
    const service = createWebLoginService(() => client);

    await expect(service.listPendingCodeApprovals()).resolves.toEqual([
      {
        createdAt: '2026-09-27T12:00:00.000Z',
        expiresAt: '2026-09-27T12:03:00.000Z',
        originHost: 'desktop.example.invalid',
        requestId,
      },
    ]);
  });

  it('returns invalid-code status and remaining attempts from mobile approval', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({
      data: { attemptsRemaining: 2, status: 'invalid-code' },
      error: null,
    });
    const service = createWebLoginService(() => client);

    await expect(service.approveCode(requestId, '123456')).resolves.toEqual({
      attemptsRemaining: 2,
      status: 'invalid-code',
    });
    expect(functions.invoke).toHaveBeenCalledWith('web-login', {
      body: { action: 'approve-code', code: '123456', requestId },
    });
  });

  it('registers and removes the current push subscription', async () => {
    const { client, functions } = createMockClient();
    functions.invoke
      .mockResolvedValueOnce({ data: { status: 'registered' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'unregistered' }, error: null });
    const service = createWebLoginService(() => client);
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-token',
      keys: { auth: 'b'.repeat(22), p256dh: 'a'.repeat(87) },
    };

    await expect(service.registerPushSubscription(subscription)).resolves.toBeUndefined();
    await expect(service.removePushSubscription(subscription.endpoint)).resolves.toBeUndefined();
    expect(functions.invoke).toHaveBeenNthCalledWith(1, 'web-login', {
      body: { action: 'register-push', subscription },
    });
    expect(functions.invoke).toHaveBeenNthCalledWith(2, 'web-login', {
      body: { action: 'unregister-push', endpoint: subscription.endpoint },
    });
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
