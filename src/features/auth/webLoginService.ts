import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type WebLoginCodeRequest = {
  code: string;
  expiresAt: string;
  pollSecret: string;
  requestId: string;
};

export type WebLoginPendingCodeApproval = {
  createdAt: string;
  expiresAt: string;
  originHost: string;
  requestId: string;
};

export type WebLoginCodeApprovalResult = {
  attemptsRemaining?: number;
  status: 'approved' | 'expired' | 'invalid-code' | 'locked';
};

export type WebLoginPushSubscription = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
};

export type WebLoginServiceErrorCode = 'configuration' | 'request';

type WebLoginStatus = 'pending' | 'approved' | 'expired';

const errorMessages: Record<WebLoginServiceErrorCode, string> = {
  configuration: 'No se pudo configurar el inicio de sesión.',
  request: 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.',
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WebLoginServiceError extends Error {
  constructor(readonly code: WebLoginServiceErrorCode) {
    super(errorMessages[code]);
    this.name = 'WebLoginServiceError';
  }
}

type ClientProvider = () => SupabaseClient<Database> | null;

export function createWebLoginService(clientProvider: ClientProvider = getSupabaseClient) {
  async function invoke(action: string, body: Record<string, unknown> = {}) {
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
    async startCode(email: string): Promise<WebLoginCodeRequest> {
      const data = await invoke('start-code', { email: email.trim() });
      if (
        typeof data.code !== 'string' ||
        !/^\d{6}$/.test(data.code) ||
        typeof data.expiresAt !== 'string' ||
        Number.isNaN(Date.parse(data.expiresAt)) ||
        typeof data.pollSecret !== 'string' ||
        !isValidSecret(data.pollSecret) ||
        typeof data.requestId !== 'string' ||
        !uuidPattern.test(data.requestId)
      ) {
        throw new WebLoginServiceError('request');
      }

      return {
        code: data.code,
        expiresAt: data.expiresAt,
        pollSecret: data.pollSecret,
        requestId: data.requestId,
      };
    },

    async listPendingCodeApprovals(): Promise<WebLoginPendingCodeApproval[]> {
      const data = await invoke('pending-code-approvals');
      if (!Array.isArray(data.requests)) {
        throw new WebLoginServiceError('request');
      }

      return data.requests.map((approval) => {
        if (
          !isRecord(approval) ||
          typeof approval.createdAt !== 'string' ||
          typeof approval.expiresAt !== 'string' ||
          typeof approval.originHost !== 'string' ||
          typeof approval.requestId !== 'string' ||
          !uuidPattern.test(approval.requestId)
        ) {
          throw new WebLoginServiceError('request');
        }
        return {
          createdAt: approval.createdAt,
          expiresAt: approval.expiresAt,
          originHost: approval.originHost,
          requestId: approval.requestId,
        };
      });
    },

    async approveCode(requestId: string, code: string): Promise<WebLoginCodeApprovalResult> {
      if (!uuidPattern.test(requestId) || !/^\d{6}$/.test(code)) {
        throw new WebLoginServiceError('request');
      }

      const data = await invoke('approve-code', { code, requestId });
      if (data.status === 'approved' || data.status === 'expired' || data.status === 'locked') {
        return { status: data.status };
      }
      if (data.status === 'invalid-code') {
        return {
          attemptsRemaining:
            typeof data.attemptsRemaining === 'number' ? data.attemptsRemaining : undefined,
          status: 'invalid-code',
        };
      }
      throw new WebLoginServiceError('request');
    },

    async rejectCode(requestId: string): Promise<'expired' | 'rejected'> {
      if (!uuidPattern.test(requestId)) {
        throw new WebLoginServiceError('request');
      }
      const data = await invoke('reject-code', { requestId });
      if (data.status !== 'expired' && data.status !== 'rejected') {
        throw new WebLoginServiceError('request');
      }
      return data.status;
    },

    async registerPushSubscription(subscription: WebLoginPushSubscription): Promise<void> {
      const data = await invoke('register-push', { subscription });
      if (data.status !== 'registered') {
        throw new WebLoginServiceError('request');
      }
    },

    async removePushSubscription(endpoint: string): Promise<void> {
      const data = await invoke('unregister-push', { endpoint });
      if (data.status !== 'unregistered') {
        throw new WebLoginServiceError('request');
      }
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

function parseStatus(value: unknown): WebLoginStatus | null {
  return value === 'pending' || value === 'approved' || value === 'expired' ? value : null;
}
