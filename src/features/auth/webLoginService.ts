import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type WebLoginRequest = {
  approvalSecret: string;
  expiresAt: string;
  pollSecret: string;
  requestId: string;
};

export type WebLoginInspection = {
  clientLabel?: string;
  expiresAt?: string;
  status: 'pending' | 'approved' | 'expired';
};

export type WebLoginServiceErrorCode = 'configuration' | 'request';

const errorMessages: Record<WebLoginServiceErrorCode, string> = {
  configuration: 'No se pudo configurar el inicio con QR.',
  request: 'No se pudo completar el inicio con QR. Inténtalo de nuevo.',
};

export class WebLoginServiceError extends Error {
  constructor(readonly code: WebLoginServiceErrorCode) {
    super(errorMessages[code]);
    this.name = 'WebLoginServiceError';
  }
}

type ClientProvider = () => SupabaseClient<Database> | null;

export function createWebLoginService(clientProvider: ClientProvider = getSupabaseClient) {
  async function invoke(action: string, body: Record<string, string> = {}) {
    const client = clientProvider();
    if (!client) {
      throw new WebLoginServiceError('configuration');
    }

    const { data, error } = await client.functions.invoke('web-login', {
      body: { action, ...body },
    });
    if (error || !isRecord(data)) {
      throw new WebLoginServiceError('request');
    }

    return data;
  }

  return {
    async start(): Promise<WebLoginRequest> {
      const data = await invoke('start');
      if (
        typeof data.requestId !== 'string' ||
        typeof data.approvalSecret !== 'string' ||
        typeof data.pollSecret !== 'string' ||
        typeof data.expiresAt !== 'string' ||
        !isValidSecret(data.approvalSecret) ||
        !isValidSecret(data.pollSecret)
      ) {
        throw new WebLoginServiceError('request');
      }

      return {
        approvalSecret: data.approvalSecret,
        expiresAt: data.expiresAt,
        pollSecret: data.pollSecret,
        requestId: data.requestId,
      };
    },

    async inspect(requestId: string, approvalSecret: string): Promise<WebLoginInspection> {
      const data = await invoke('inspect', { requestId, secret: approvalSecret });
      const status = parseStatus(data.status);
      if (!status) {
        throw new WebLoginServiceError('request');
      }

      return {
        clientLabel: typeof data.clientLabel === 'string' ? data.clientLabel : undefined,
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
        status,
      };
    },

    async approve(
      requestId: string,
      approvalSecret: string,
    ): Promise<WebLoginInspection['status']> {
      const data = await invoke('approve', { requestId, secret: approvalSecret });
      const status = parseStatus(data.status);
      if (!status) {
        throw new WebLoginServiceError('request');
      }
      return status;
    },

    async poll(
      requestId: string,
      pollSecret: string,
    ): Promise<'pending' | 'expired' | 'authenticated'> {
      const data = await invoke('poll', { requestId, secret: pollSecret });
      const status = parseStatus(data.status);
      if (status === 'pending') {
        return 'pending';
      }
      if (status !== 'approved') {
        return 'expired';
      }
      if (typeof data.email !== 'string' || typeof data.tokenHash !== 'string') {
        throw new WebLoginServiceError('request');
      }

      const client = clientProvider();
      if (!client) {
        throw new WebLoginServiceError('configuration');
      }

      const { data: authData, error } = await client.auth.verifyOtp({
        email: data.email,
        token_hash: data.tokenHash,
        type: 'magiclink',
      });
      if (error || !authData.session) {
        throw new WebLoginServiceError('request');
      }

      return 'authenticated';
    },
  };
}

export const webLoginService = createWebLoginService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSecret(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function parseStatus(value: unknown): WebLoginInspection['status'] | null {
  return value === 'pending' || value === 'approved' || value === 'expired' ? value : null;
}
