import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createAccountDeletionHandler } from '../_shared/accountDeletionWorker.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  getDefaultSecretKey(Deno.env.get('SUPABASE_SECRET_KEYS'));
const cronSecret = Deno.env.get('ACCOUNT_DELETION_CRON_SECRET') ?? '';

if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
  Deno.serve(() => Response.json({ error: 'Worker configuration unavailable.' }, { status: 500 }));
} else {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const handler = createAccountDeletionHandler(
    {
      async claimExpiredAccounts(batchSize) {
        const { data, error } = await adminClient.rpc('claim_expired_account_deletions', {
          p_batch_size: batchSize,
        });
        if (error) {
          throw new Error('Could not claim expired accounts.');
        }

        return (data ?? []).map((row) => row.user_id);
      },
      async deleteAuthUser(userId) {
        const { error } = await adminClient.auth.admin.deleteUser(userId);
        return error ? { code: error.code, status: error.status } : null;
      },
      async releaseClaim(userId) {
        const { error } = await adminClient.rpc('release_expired_account_deletion_claim', {
          p_user_id: userId,
        });
        if (error) {
          throw new Error('Could not release account deletion claim.');
        }
      },
    },
    cronSecret,
  );

  Deno.serve(handler);
}

function getDefaultSecretKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const secretKeys = JSON.parse(value) as Record<string, unknown>;
    return typeof secretKeys.default === 'string' ? secretKeys.default : undefined;
  } catch {
    return undefined;
  }
}
