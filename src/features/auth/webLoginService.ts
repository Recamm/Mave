import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type WebLoginRequest = {
  approvalSecret: string;
  expiresAt: string;
  pollSecret: string;
  requestId: string;
};

export type WebLoginApprovalChallenge = Pick<WebLoginRequest, 'approvalSecret' | 'requestId'>;

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

export type WebLoginInspection = {
  clientLabel?: string;
  expiresAt?: string;
  status: 'pending' | 'approved' | 'expired';
};

export type WebLoginServiceErrorCode = 'configuration' | 'request';

const errorMessages: Record<WebLoginServiceErrorCode, string> = {
  configuration: 'No se pudo configurar el inicio con QR.',
  request: 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.',
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const approvalSecretPattern = /^[0-9a-f]{64}$/i;

export function parseWebLoginApprovalCode(
  value: string,
  currentOrigin: string,
): WebLoginApprovalChallenge | null {
  const input = value.trim();
  let requestId: string | null;
  let approvalSecret: string | null;

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (url.origin !== currentOrigin || url.pathname !== '/login/approve') {
        return null;
      }

      const params = new URLSearchParams(url.hash.slice(1));
      requestId = params.get('request');
      approvalSecret = params.get('approval');
    } catch {
      return null;
    }
  } else {
    const match = /^([^:.\s]+)[:.]([0-9a-f]{64})$/i.exec(input);
    requestId = match?.[1] ?? null;
    approvalSecret = match?.[2] ?? null;
  }

  if (
    !requestId ||
    !approvalSecret ||
    !uuidPattern.test(requestId) ||
    !approvalSecretPattern.test(approvalSecret)
  ) {
    return null;
  }

  return { approvalSecret: approvalSecret.toLowerCase(), requestId: requestId.toLowerCase() };
}

export function createWebLoginApprovalPath(challenge: WebLoginApprovalChallenge): string {
  const params = new URLSearchParams({
    approval: challenge.approvalSecret,
    request: challenge.requestId,
  });
  return `/login/approve#${params.toString()}`;
}

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
