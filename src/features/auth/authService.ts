import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type AuthServiceErrorCode = 'offline' | 'configuration' | 'request';

const errorMessages: Record<AuthServiceErrorCode, string> = {
  offline: 'Necesitas conexión a Internet para crear una cuenta.',
  configuration: 'No se pudo configurar la conexión con el servicio.',
  request: 'No se pudo completar la solicitud. Revisa tus datos e inténtalo de nuevo.',
};

export class AuthServiceError extends Error {
  constructor(readonly code: AuthServiceErrorCode) {
    super(errorMessages[code]);
    this.name = 'AuthServiceError';
  }
}

type AuthClientProvider = () => SupabaseClient<Database> | null;
type OnlineCheck = () => boolean;

export function createAuthService(
  clientProvider: AuthClientProvider = getSupabaseClient,
  isOnline: OnlineCheck = () => typeof navigator === 'undefined' || navigator.onLine,
) {
  function requireClient(): SupabaseClient<Database> {
    const client = clientProvider();

    if (!client) {
      throw new AuthServiceError('configuration');
    }

    return client;
  }

  return {
    async signUp(email: string, password: string): Promise<{ requiresEmailConfirmation: boolean }> {
      if (!isOnline()) {
        throw new AuthServiceError('offline');
      }

      const { data, error } = await requireClient().auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new AuthServiceError('request');
      }

      return { requiresEmailConfirmation: data.session === null };
    },

    async signIn(email: string, password: string): Promise<void> {
      const { error } = await requireClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw new AuthServiceError('request');
      }
    },

    async requestPasswordRecovery(email: string): Promise<void> {
      const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin;
      const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        throw new AuthServiceError('request');
      }
    },

    async signOut(): Promise<void> {
      const { error } = await requireClient().auth.signOut();

      if (error) {
        throw new AuthServiceError('request');
      }
    },
  };
}

export const authService = createAuthService();
