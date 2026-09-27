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
  magicLinkTokenHash?: string;
  pollSecretHash: string;
  userId?: string;
};

function createHarness() {
  let currentTime = new Date('2026-09-27T12:00:00.000Z');
  const challenges = new Map<string, TestChallenge>();
  const generatedSecrets = [approvalSecret, pollSecret];
  const createMagicLinkTokenHash = vi.fn(async () => 'one-time-token-hash');

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
        originHost: input.originHost,
        status: 'pending',
        expiresAt: input.expiresAt,
      });
      return requestId;
    },
    async inspectApproval(id, secretHash) {
      const challenge = challenges.get(id);
      if (!challenge || challenge.approvalSecretHash !== secretHash) {
        return null;
      }
      return challenge;
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
    authenticateUser: async (request) =>
      request.headers.get('authorization') === 'Bearer mobile-session' ? account : null,
    createSecret: () => generatedSecrets.shift() ?? 'c'.repeat(64),
    generateMagicLinkTokenHash: createMagicLinkTokenHash,
    now: () => currentTime,
    store,
  });

  return {
    createMagicLinkTokenHash,
    handler,
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
});
