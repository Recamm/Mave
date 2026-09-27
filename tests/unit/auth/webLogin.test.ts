import { describe, expect, it, vi } from 'vitest';
import {
  createWebLoginHandler,
  type WebLoginChallengeStore,
  type WebLoginChallengeView,
} from '../../../supabase/functions/_shared/webLogin';

const requestId = 'c22e553d-87b3-44c4-9c0d-0137c8881111';
const approvalSecret = 'a'.repeat(64);
const pollSecret = 'b'.repeat(64);
const account = { email: 'person@example.invalid', id: 'f22e553d-87b3-44c4-9c0d-0137c8881111' };

type TestChallenge = WebLoginChallengeView & {
  accountEmail?: string;
  approvalSecretHash: string;
  createdAt: string;
  failedAttempts: number;
  loginMethod?: 'code' | 'qr';
  magicLinkTokenHash?: string;
  pollSecretHash: string;
  targetUserId?: string | null;
  userId?: string;
};

function createHarness() {
  let currentTime = new Date('2026-09-27T12:00:00.000Z');
  const challenges = new Map<string, TestChallenge>();
  const generatedSecrets = [approvalSecret, pollSecret];
  const createMagicLinkTokenHash = vi.fn(async () => 'one-time-token-hash');
  const sendLoginPush = vi.fn(async () => undefined);
  const registeredPushSubscriptions: Array<{
    subscription: { endpoint: string; keys: { auth: string; p256dh: string } };
    userId: string;
  }> = [];
  const removedPushSubscriptions: Array<{ endpoint: string; userId: string }> = [];

  const store: WebLoginChallengeStore = {
    async cleanupExpired(now) {
      for (const [id, challenge] of challenges) {
        if (Date.parse(challenge.expiresAt) <= Date.parse(now)) {
          challenges.delete(id);
        }
      }
    },
    async create(input) {
      challenges.set(requestId, {
        ...input,
        loginMethod: 'qr',
        originHost: input.originHost,
        status: 'pending',
        expiresAt: input.expiresAt,
        createdAt: currentTime.toISOString(),
        failedAttempts: 0,
      });
      return requestId;
    },
    async createCodeChallenge(input) {
      challenges.set(input.requestId, {
        ...input,
        createdAt: currentTime.toISOString(),
        failedAttempts: 0,
        loginMethod: 'code',
        originHost: input.originHost,
        status: 'pending',
        targetUserId: input.targetUserId,
      });
      return { notificationUserId: input.targetUserId, requestId: input.requestId };
    },
    async inspectApproval(id, secretHash) {
      const challenge = challenges.get(id);
      if (!challenge || challenge.approvalSecretHash !== secretHash) {
        return null;
      }
      return challenge;
    },
    async listPendingCodeApprovals(userId, now) {
      return [...challenges.entries()]
        .filter(
          ([, challenge]) =>
            challenge.loginMethod === 'code' &&
            challenge.targetUserId === userId &&
            challenge.status === 'pending' &&
            Date.parse(challenge.expiresAt) > Date.parse(now),
        )
        .map(([id, challenge]) => ({
          createdAt: challenge.createdAt,
          expiresAt: challenge.expiresAt,
          originHost: challenge.originHost,
          requestId: id,
        }));
    },
    async inspectCodeApproval(id, userId, now) {
      const challenge = challenges.get(id);
      if (
        !challenge ||
        challenge.loginMethod !== 'code' ||
        challenge.targetUserId !== userId ||
        challenge.status !== 'pending' ||
        Date.parse(challenge.expiresAt) <= Date.parse(now)
      ) {
        return null;
      }
      return challenge;
    },
    async recordFailedCodeAttempt(id, userId, now) {
      const challenge = await this.inspectCodeApproval(id, userId, now);
      if (!challenge) {
        return null;
      }
      challenge.failedAttempts += 1;
      if (challenge.failedAttempts >= 5) {
        challenge.status = 'consumed';
      }
      return challenge.failedAttempts;
    },
    async rejectCodeApproval(id, userId, now) {
      const challenge = await this.inspectCodeApproval(id, userId, now);
      if (!challenge) {
        return false;
      }
      challenge.status = 'consumed';
      return true;
    },
    async registerPushSubscription(userId, subscription) {
      registeredPushSubscriptions.push({ subscription, userId });
    },
    async removePushSubscription(userId, endpoint) {
      removedPushSubscriptions.push({ endpoint, userId });
    },
    async inspectPoll(id, secretHash) {
      const challenge = challenges.get(id);
      if (!challenge || challenge.pollSecretHash !== secretHash) {
        return null;
      }
      return challenge;
    },
    async approve(input) {
      const challenge = challenges.get(input.requestId);
      if (
        !challenge ||
        challenge.loginMethod !== 'qr' ||
        challenge.approvalSecretHash !== input.approvalSecretHash ||
        challenge.status !== 'pending' ||
        Date.parse(challenge.expiresAt) <= currentTime.getTime()
      ) {
        return false;
      }

      challenge.accountEmail = input.accountEmail;
      challenge.magicLinkTokenHash = input.magicLinkTokenHash;
      challenge.status = 'approved';
      challenge.userId = input.userId;
      return true;
    },
    async approveCode(input) {
      const challenge = challenges.get(input.requestId);
      if (
        !challenge ||
        challenge.loginMethod !== 'code' ||
        challenge.targetUserId !== input.userId ||
        challenge.approvalSecretHash !== input.approvalSecretHash ||
        challenge.status !== 'pending' ||
        challenge.failedAttempts >= 5 ||
        Date.parse(challenge.expiresAt) <= currentTime.getTime()
      ) {
        return false;
      }

      challenge.accountEmail = input.accountEmail;
      challenge.magicLinkTokenHash = input.magicLinkTokenHash;
      challenge.status = 'approved';
      challenge.userId = input.userId;
      return true;
    },
    async consume(id, secretHash) {
      const challenge = challenges.get(id);
      if (
        !challenge ||
        challenge.pollSecretHash !== secretHash ||
        challenge.status !== 'approved' ||
        Date.parse(challenge.expiresAt) <= currentTime.getTime() ||
        !challenge.accountEmail ||
        !challenge.magicLinkTokenHash
      ) {
        return null;
      }

      challenge.status = 'consumed';
      const handoff = {
        accountEmail: challenge.accountEmail,
        magicLinkTokenHash: challenge.magicLinkTokenHash,
      };
      challenge.magicLinkTokenHash = undefined;
      return handoff;
    },
  };

  const handler = createWebLoginHandler({
    authenticateUser: async (request) => {
      const authorization = request.headers.get('authorization');
      if (authorization === 'Bearer mobile-session') {
        return account;
      }
      if (authorization === 'Bearer other-mobile-session') {
        return { email: 'other@example.invalid', id: 'e22e553d-87b3-44c4-9c0d-0137c8881111' };
      }
      return null;
    },
    createApprovalCode: () => '004218',
    createSecret: () => generatedSecrets.shift() ?? 'c'.repeat(64),
    generateMagicLinkTokenHash: createMagicLinkTokenHash,
    hashLoginCode: async (id, code) => `test-hash:${id}:${code}`,
    now: () => currentTime,
    resolveUserIdByEmail: async (email) => (email === account.email ? account.id : null),
    sendLoginPush,
    store,
  });

  return {
    createMagicLinkTokenHash,
    handler,
    registeredPushSubscriptions,
    removedPushSubscriptions,
    sendLoginPush,
    setCurrentTime(value: Date) {
      currentTime = value;
    },
  };
}

function createRequest(
  body: object,
  authorization?: string,
  origin = 'https://desktop.example.invalid',
): Request {
  const headers = new Headers({ 'content-type': 'application/json', origin });
  if (authorization) {
    headers.set('authorization', authorization);
  }
  return new Request('https://api.example.invalid/functions/v1/web-login', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function startLogin(handler: (request: Request) => Promise<Response>) {
  const response = await handler(createRequest({ action: 'start' }));
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    approvalSecret: string;
    expiresAt: string;
    pollSecret: string;
    requestId: string;
  }>;
}

describe('web login challenge handler', () => {
  it('requires an authenticated mobile approval and consumes a separate PC secret once', async () => {
    const { createMagicLinkTokenHash, handler } = createHarness();
    const challenge = await startLogin(handler);

    const inspectResponse = await handler(
      createRequest({
        action: 'inspect',
        requestId: challenge.requestId,
        secret: challenge.approvalSecret,
      }),
    );
    expect(await inspectResponse.json()).toMatchObject({
      clientLabel: 'desktop.example.invalid',
      status: 'pending',
    });

    const unauthorizedResponse = await handler(
      createRequest(
        { action: 'approve', requestId: challenge.requestId, secret: challenge.approvalSecret },
        'Bearer invalid-session',
      ),
    );
    expect(unauthorizedResponse.status).toBe(401);
    expect(createMagicLinkTokenHash).not.toHaveBeenCalled();

    const wrongPollResponse = await handler(
      createRequest({
        action: 'poll',
        requestId: challenge.requestId,
        secret: challenge.approvalSecret,
      }),
    );
    expect(await wrongPollResponse.json()).toEqual({ status: 'expired' });

    const approvalResponse = await handler(
      createRequest(
        { action: 'approve', requestId: challenge.requestId, secret: challenge.approvalSecret },
        'Bearer mobile-session',
      ),
    );
    expect(await approvalResponse.json()).toEqual({ status: 'approved' });
    expect(createMagicLinkTokenHash).toHaveBeenCalledWith(account.email);

    const pollResponse = await handler(
      createRequest({
        action: 'poll',
        requestId: challenge.requestId,
        secret: challenge.pollSecret,
      }),
    );
    expect(await pollResponse.json()).toEqual({
      email: account.email,
      status: 'approved',
      tokenHash: 'one-time-token-hash',
    });

    const replayResponse = await handler(
      createRequest({
        action: 'poll',
        requestId: challenge.requestId,
        secret: challenge.pollSecret,
      }),
    );
    expect(await replayResponse.json()).toEqual({ status: 'expired' });
  });

  it('expires an unapproved request after three minutes', async () => {
    const { handler, setCurrentTime } = createHarness();
    const challenge = await startLogin(handler);
    setCurrentTime(new Date(Date.parse(challenge.expiresAt) + 1));

    const response = await handler(
      createRequest({
        action: 'inspect',
        requestId: challenge.requestId,
        secret: challenge.approvalSecret,
      }),
    );
    expect(await response.json()).toEqual({ status: 'expired' });
  });

  it('notifies the account device and completes a six-digit login after mobile approval', async () => {
    const { createMagicLinkTokenHash, handler, sendLoginPush } = createHarness();
    const startResponse = await handler(
      createRequest({ action: 'start-code', email: ` ${account.email.toUpperCase()} ` }),
    );
    expect(startResponse.status).toBe(201);
    const challenge = (await startResponse.json()) as {
      code: string;
      expiresAt: string;
      pollSecret: string;
      requestId: string;
    };
    expect(challenge.code).toBe('004218');
    expect(challenge.code).toMatch(/^\d{6}$/);
    expect(sendLoginPush).toHaveBeenCalledWith(account.id, {
      expiresAt: challenge.expiresAt,
      originHost: 'desktop.example.invalid',
      requestId: challenge.requestId,
    });

    const unauthenticatedInbox = await handler(createRequest({ action: 'pending-code-approvals' }));
    expect(unauthenticatedInbox.status).toBe(401);

    const inbox = await handler(
      createRequest({ action: 'pending-code-approvals' }, 'Bearer mobile-session'),
    );
    expect(await inbox.json()).toEqual({
      requests: [
        expect.objectContaining({
          originHost: 'desktop.example.invalid',
          requestId: challenge.requestId,
        }),
      ],
    });

    const wrongAccount = await handler(
      createRequest(
        { action: 'approve-code', code: challenge.code, requestId: challenge.requestId },
        'Bearer other-mobile-session',
      ),
    );
    expect(await wrongAccount.json()).toEqual({ status: 'expired' });

    const approval = await handler(
      createRequest(
        { action: 'approve-code', code: challenge.code, requestId: challenge.requestId },
        'Bearer mobile-session',
      ),
    );
    expect(await approval.json()).toEqual({ status: 'approved' });
    expect(createMagicLinkTokenHash).toHaveBeenCalledWith(account.email);

    const poll = await handler(
      createRequest({
        action: 'poll',
        requestId: challenge.requestId,
        secret: challenge.pollSecret,
      }),
    );
    expect(await poll.json()).toEqual({
      email: account.email,
      status: 'approved',
      tokenHash: 'one-time-token-hash',
    });
  });

  it('locks a six-digit challenge after five incorrect mobile attempts', async () => {
    const { createMagicLinkTokenHash, handler } = createHarness();
    const startResponse = await handler(
      createRequest({ action: 'start-code', email: account.email }),
    );
    const challenge = (await startResponse.json()) as { requestId: string };

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await handler(
        createRequest(
          { action: 'approve-code', code: '999999', requestId: challenge.requestId },
          'Bearer mobile-session',
        ),
      );
      expect(await response.json()).toEqual({
        attemptsRemaining: 5 - attempt,
        status: 'invalid-code',
      });
    }

    const locked = await handler(
      createRequest(
        { action: 'approve-code', code: '999999', requestId: challenge.requestId },
        'Bearer mobile-session',
      ),
    );
    expect(await locked.json()).toEqual({ status: 'locked' });
    expect(createMagicLinkTokenHash).not.toHaveBeenCalled();
  });

  it('returns the same code-login response without notifying for unknown accounts', async () => {
    const { handler, sendLoginPush } = createHarness();
    const response = await handler(
      createRequest({ action: 'start-code', email: 'unknown@example.invalid' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: '004218',
      expiresAt: '2026-09-27T12:03:00.000Z',
      pollSecret: approvalSecret,
      requestId: expect.any(String),
    });
    expect(sendLoginPush).not.toHaveBeenCalled();
  });

  it('registers and removes push subscriptions only for the authenticated account', async () => {
    const { handler, registeredPushSubscriptions, removedPushSubscriptions } = createHarness();
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-token',
      keys: { auth: 'B'.repeat(22), p256dh: 'A'.repeat(87) },
    };

    const unauthorized = await handler(createRequest({ action: 'register-push', subscription }));
    expect(unauthorized.status).toBe(401);

    const unsafeEndpoint = await handler(
      createRequest(
        {
          action: 'register-push',
          subscription: { ...subscription, endpoint: 'https://127.0.0.1/collect' },
        },
        'Bearer mobile-session',
      ),
    );
    expect(unsafeEndpoint.status).toBe(400);

    const registered = await handler(
      createRequest({ action: 'register-push', subscription }, 'Bearer mobile-session'),
    );
    expect(await registered.json()).toEqual({ status: 'registered' });
    expect(registeredPushSubscriptions).toEqual([{ subscription, userId: account.id }]);

    const removed = await handler(
      createRequest(
        { action: 'unregister-push', endpoint: subscription.endpoint },
        'Bearer mobile-session',
      ),
    );
    expect(await removed.json()).toEqual({ status: 'unregistered' });
    expect(removedPushSubscriptions).toEqual([
      { endpoint: subscription.endpoint, userId: account.id },
    ]);
  });
});
