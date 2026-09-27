import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type AccountLifecycle = Database['public']['Tables']['account_lifecycle']['Row'];
type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;
type ClientProvider = () => Client | null;

const lifecycleFields =
  'user_id,deletion_requested_at,deletion_due_at,deletion_canceled_at,deletion_started_at,deletion_worker_lease_until' as const;

export function createDeletionService(clientProvider: ClientProvider = getSupabaseClient) {
  function requireClient(): Client {
    const client = clientProvider();
    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async getStatus(): Promise<AccountLifecycle | null> {
      const { data, error } = await requireClient()
        .from('account_lifecycle')
        .select(lifecycleFields)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async accountSyncAllowed(): Promise<boolean> {
      const { data, error } = await requireClient().rpc('account_sync_allowed', {});
      if (error) {
        throw error;
      }

      return data;
    },

    async requestDeletion(): Promise<AccountLifecycle> {
      const { data, error } = await requireClient().rpc('request_account_deletion', {});
      if (error) {
        throw error;
      }

      return data;
    },

    async cancelDeletion(): Promise<AccountLifecycle> {
      const { data, error } = await requireClient().rpc('cancel_account_deletion', {});
      if (error) {
        throw error;
      }

      return data;
    },
  };
}

export const deletionService = createDeletionService();
