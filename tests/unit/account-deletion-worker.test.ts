import { describe, expect, it } from 'vitest';
import {
  createAccountDeletionHandler,
  type AccountDeletionWorkerDependencies,
} from '../../supabase/functions/_shared/accountDeletionWorker';

const ownerId = '00000000-0000-0000-0000-000000000071';
const cronSecret = 'worker-test-secret';

function createRequest(authorization = `Bearer ${cronSecret}`): Request {
  return new Request(
    'https://mave.example.invalid/functions/v1/process-expired-account-deletions',
    {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000099' }),
    },
  );
}

describe('account deletion worker', () => {
  it('rejects requests without the server-side worker secret', async () => {
    let claimCalls = 0;
    const dependencies: AccountDeletionWorkerDependencies = {
      claimExpiredAccounts: async () => {
        claimCalls += 1;
        return [ownerId];
      },
      deleteAuthUser: async () => null,
      releaseClaim: async () => undefined,
    };
    const handler = createAccountDeletionHandler(dependencies, cronSecret);

    const response = await handler(createRequest('Bearer invalid'));

    expect(response.status).toBe(401);
    expect(claimCalls).toBe(0);
  });

  it('processes only server-claimed accounts and is harmless when run twice', async () => {
    const claimedAccounts = new Set([ownerId]);
    const deletedAccounts: string[] = [];
    const dependencies: AccountDeletionWorkerDependencies = {
      claimExpiredAccounts: async () => [...claimedAccounts],
      deleteAuthUser: async (userId) => {
        deletedAccounts.push(userId);
        claimedAccounts.delete(userId);
        return null;
      },
      releaseClaim: async (userId) => {
        claimedAccounts.add(userId);
      },
    };
    const handler = createAccountDeletionHandler(dependencies, cronSecret);

    const firstResponse = await handler(createRequest());
    const firstResult = await firstResponse.json();
    const secondResponse = await handler(createRequest());
    const secondResult = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstResult).toEqual({ failed: 0, processed: 1 });
    expect(secondResponse.status).toBe(200);
    expect(secondResult).toEqual({ failed: 0, processed: 0 });
    expect(deletedAccounts).toEqual([ownerId]);
  });

  it('reports partial failure and makes the failed claim available for retry', async () => {
    const claimedAccounts = new Set([ownerId]);
    const releaseAttempts: string[] = [];
    let shouldFail = true;
    const dependencies: AccountDeletionWorkerDependencies = {
      claimExpiredAccounts: async () => [...claimedAccounts],
      deleteAuthUser: async (userId) => {
        if (shouldFail) {
          shouldFail = false;
          return { code: 'service_unavailable', status: 503 };
        }

        claimedAccounts.delete(userId);
        return null;
      },
      releaseClaim: async (userId) => {
        releaseAttempts.push(userId);
      },
    };
    const handler = createAccountDeletionHandler(dependencies, cronSecret);

    const failedResponse = await handler(createRequest());
    expect(failedResponse.status).toBe(500);
    expect(await failedResponse.json()).toEqual({ failed: 1, processed: 0 });

    const retryResponse = await handler(createRequest());
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toEqual({ failed: 0, processed: 1 });
    expect(releaseAttempts).toEqual([ownerId]);
  });
});
