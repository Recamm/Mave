export const WEB_LOGIN_LIFETIME_MS = 3 * 60 * 1000;

export type WebLoginChallengeStatus = 'pending' | 'approved' | 'consumed';

export type WebLoginChallengeView = {
  expiresAt: string;
  originHost: string;
  status: WebLoginChallengeStatus;
};

export type WebLoginChallengeStore = {
  cleanupExpired: (now: string) => Promise<void>;
  create: (input: {
    approvalSecretHash: string;
    expiresAt: string;
    originHost: string;
    pollSecretHash: string;
  }) => Promise<string>;
  inspectApproval: (
    requestId: string,
    secretHash: string,
  ) => Promise<WebLoginChallengeView | null>;
  inspectPoll: (requestId: string, secretHash: string) => Promise<WebLoginChallengeView | null>;
  approve: (input: {
    accountEmail: string;
    approvalSecretHash: string;
    magicLinkTokenHash: string;
    requestId: string;
    userId: string;
  }) => Promise<boolean>;
  consume: (
    requestId: string,
    pollSecretHash: string,
  ) => Promise<{ accountEmail: string; magicLinkTokenHash: string } | null>;
};

export type WebLoginUser = { email: string | null; id: string };

export type WebLoginDependencies = {
  authenticateUser: (request: Request) => Promise<WebLoginUser | null>;
  createSecret?: () => string;
  generateMagicLinkTokenHash: (email: string) => Promise<string>;
  hashSecret?: (secret: string) => Promise<string>;
  now?: () => Date;
  store: WebLoginChallengeStore;
};

type RequestBody = {
  action?: unknown;
  requestId?: unknown;
  secret?: unknown;
};

export function createWebLoginHandler(dependencies: WebLoginDependencies) {
  const createSecret = dependencies.createSecret ?? generateSecret;
  const hashSecret = dependencies.hashSecret ?? hashChallengeSecret;
  const now = dependencies.now ?? (() => new Date());

  return async function handleWebLoginRequest(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'POST') {
      return jsonResponse(request, { error: 'Method not allowed.' }, 405);
    }

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return jsonResponse(request, { error: 'Invalid request.' }, 400);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse(request, { error: 'Invalid request.' }, 400);
    }

    try {
      switch (body.action) {
        case 'start':
          return await startChallenge(request, dependencies.store, createSecret, hashSecret, now);
        case 'inspect':
          return await inspectChallenge(request, dependencies.store, body, hashSecret, now);
        case 'approve':
          return await approveChallenge(request, dependencies, body, hashSecret, now);
        case 'poll':
          return await pollChallenge(request, dependencies.store, body, hashSecret, now);
        default:
          return jsonResponse(request, { error: 'Invalid request.' }, 400);
      }
    } catch {
      return jsonResponse(request, { error: 'Unable to process the login request.' }, 500);
    }
  };
}

async function startChallenge(
  request: Request,
  store: WebLoginChallengeStore,
  createSecret: () => string,
  hashSecret: (secret: string) => Promise<string>,
  now: () => Date,
): Promise<Response> {
  const currentTime = now();
  const approvalSecret = createSecret();
  const pollSecret = createSecret();

  if (!isSecret(approvalSecret) || !isSecret(pollSecret) || approvalSecret === pollSecret) {
    throw new Error('Could not create login secrets.');
  }

  await store.cleanupExpired(currentTime.toISOString());

  const expiresAt = new Date(currentTime.getTime() + WEB_LOGIN_LIFETIME_MS).toISOString();
  const requestId = await store.create({
    approvalSecretHash: await hashSecret(approvalSecret),
    expiresAt,
    originHost: getOriginHost(request.headers.get('origin')),
    pollSecretHash: await hashSecret(pollSecret),
  });

  return jsonResponse(
    request,
    { approvalSecret, expiresAt, pollSecret, requestId },
    201,
  );
}

async function inspectChallenge(
  request: Request,
  store: WebLoginChallengeStore,
  body: RequestBody,
  hashSecret: (secret: string) => Promise<string>,
  now: () => Date,
): Promise<Response> {
  const challengeInput = getChallengeInput(body);
  if (!challengeInput) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const challenge = await store.inspectApproval(
    challengeInput.requestId,
    await hashSecret(challengeInput.secret),
  );

  if (!isActive(challenge, now()) || challenge.status === 'consumed') {
    return jsonResponse(request, { status: 'expired' });
  }

  return jsonResponse(request, {
    clientLabel: challenge.originHost,
    expiresAt: challenge.expiresAt,
    status: challenge.status,
  });
}

async function approveChallenge(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
  hashSecret: (secret: string) => Promise<string>,
  now: () => Date,
): Promise<Response> {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const user = await dependencies.authenticateUser(request);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const accountEmail = user.email?.trim();
  if (!accountEmail) {
    return jsonResponse(request, { error: 'An email account is required.' }, 403);
  }

  const challengeInput = getChallengeInput(body);
  if (!challengeInput) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const approvalSecretHash = await hashSecret(challengeInput.secret);
  const challenge = await dependencies.store.inspectApproval(
    challengeInput.requestId,
    approvalSecretHash,
  );

  const observedStatus = challenge?.status;
  if (!isPending(challenge, now())) {
    return jsonResponse(request, {
      status: observedStatus === 'approved' ? 'approved' : 'expired',
    });
  }

  const magicLinkTokenHash = await dependencies.generateMagicLinkTokenHash(accountEmail);
  const approved = await dependencies.store.approve({
    accountEmail,
    approvalSecretHash,
    magicLinkTokenHash,
    requestId: challengeInput.requestId,
    userId: user.id,
  });

  return jsonResponse(request, { status: approved ? 'approved' : 'expired' });
}

async function pollChallenge(
  request: Request,
  store: WebLoginChallengeStore,
  body: RequestBody,
  hashSecret: (secret: string) => Promise<string>,
  now: () => Date,
): Promise<Response> {
  const challengeInput = getChallengeInput(body);
  if (!challengeInput) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const pollSecretHash = await hashSecret(challengeInput.secret);
  const challenge = await store.inspectPoll(challengeInput.requestId, pollSecretHash);
  if (!isActive(challenge, now())) {
    return jsonResponse(request, { status: 'expired' });
  }

  if (challenge.status === 'pending') {
    return jsonResponse(request, { status: 'pending' });
  }

  if (challenge.status !== 'approved') {
    return jsonResponse(request, { status: 'expired' });
  }

  const handoff = await store.consume(challengeInput.requestId, pollSecretHash);
  if (!handoff) {
    return jsonResponse(request, { status: 'expired' });
  }

  return jsonResponse(request, {
    email: handoff.accountEmail,
    status: 'approved',
    tokenHash: handoff.magicLinkTokenHash,
  });
}

function getChallengeInput(
  body: RequestBody,
): { requestId: string; secret: string } | null {
  if (
    typeof body.requestId !== 'string' ||
    !isUuid(body.requestId) ||
    typeof body.secret !== 'string' ||
    !isSecret(body.secret)
  ) {
    return null;
  }

  return { requestId: body.requestId, secret: body.secret };
}

function isActive(
  challenge: WebLoginChallengeView | null,
  currentTime: Date,
): challenge is WebLoginChallengeView {
  return Boolean(challenge && Date.parse(challenge.expiresAt) > currentTime.getTime());
}

function isPending(
  challenge: WebLoginChallengeView | null,
  currentTime: Date,
): challenge is WebLoginChallengeView {
  return isActive(challenge, currentTime) && challenge.status === 'pending';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isSecret(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

async function hashChallengeSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getOriginHost(origin: string | null): string {
  if (!origin) {
    return 'Origen desconocido';
  }

  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.host.slice(0, 255);
    }
  } catch {
    return 'Origen desconocido';
  }

  return 'Origen desconocido';
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin',
  });
  headers.set('access-control-allow-origin', request.headers.get('origin') ?? '*');
  return headers;
}

function jsonResponse(request: Request, body: object, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}