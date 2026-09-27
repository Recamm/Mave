type AuthDeletionError = {
  code?: string | null;
  status?: number | null;
};

export type AccountDeletionWorkerDependencies = {
  claimExpiredAccounts: (batchSize: number) => Promise<string[]>;
  deleteAuthUser: (userId: string) => Promise<AuthDeletionError | null>;
  releaseClaim: (userId: string) => Promise<void>;
};

type AccountDeletionBatchResult = {
  failed: number;
  processed: number;
};

export async function processExpiredAccountDeletions(
  dependencies: AccountDeletionWorkerDependencies,
  batchSize = 100,
): Promise<AccountDeletionBatchResult> {
  let userIds: string[];
  try {
    userIds = await dependencies.claimExpiredAccounts(batchSize);
  } catch {
    return { failed: 1, processed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const error = await dependencies.deleteAuthUser(userId);
      if (error && error.status !== 404 && error.code !== 'user_not_found') {
        failed += 1;
        await releaseClaim(dependencies, userId);
        continue;
      }

      processed += 1;
    } catch {
      failed += 1;
      await releaseClaim(dependencies, userId);
    }
  }

  return { failed, processed };
}

export function createAccountDeletionHandler(
  dependencies: AccountDeletionWorkerDependencies,
  cronSecret: string,
) {
  return async function handleAccountDeletionRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }

    if (!cronSecret) {
      return Response.json({ error: 'Worker configuration unavailable.' }, { status: 500 });
    }

    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const result = await processExpiredAccountDeletions(dependencies);
    return Response.json(result, { status: result.failed > 0 ? 500 : 200 });
  };
}

async function releaseClaim(
  dependencies: AccountDeletionWorkerDependencies,
  userId: string,
): Promise<void> {
  try {
    await dependencies.releaseClaim(userId);
  } catch {
    return;
  }
}
