export const WEB_LOGIN_LIFETIME_MS = 3 * 60 * 1000;

export type WebLoginChallengeStatus = 'pending' | 'approved' | 'consumed';

export type WebLoginChallengeView = {
  expiresAt: string;
  originHost: string;
  status: WebLoginChallengeStatus;
};

export type WebLoginCodeApproval = {
  createdAt: string;
  expiresAt: string;
  originHost: string;
  requestId: string;
};

export type WebLoginCodeChallengeView = WebLoginChallengeView & {
  approvalSecretHash: string;
  failedAttempts: number;
};

export type WebLoginPushSubscription = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
};

export type WebLoginChallengeStore = {
  cleanupExpired: (now: string) => Promise<void>;
  create: (input: {
    approvalSecretHash: string;
    expiresAt: string;
    originHost: string;
    pollSecretHash: string;
  }) => Promise<string>;
  createCodeChallenge: (input: {
    approvalSecretHash: string;
    expiresAt: string;
    originHost: string;
    pollSecretHash: string;
    requestId: string;
    targetUserId: string | null;
  }) => Promise<{ notificationUserId: string | null; requestId: string }>;
  inspectApproval: (
    requestId: string,
    secretHash: string,
  ) => Promise<WebLoginChallengeView | null>;
  listPendingCodeApprovals: (
    userId: string,
    now: string,
  ) => Promise<WebLoginCodeApproval[]>;
  inspectCodeApproval: (
    requestId: string,
    userId: string,
    now: string,
  ) => Promise<WebLoginCodeChallengeView | null>;
  recordFailedCodeAttempt: (requestId: string, userId: string, now: string) => Promise<number | null>;
  rejectCodeApproval: (requestId: string, userId: string, now: string) => Promise<boolean>;
  registerPushSubscription: (
    userId: string,
    subscription: WebLoginPushSubscription,
  ) => Promise<void>;
  removePushSubscription: (userId: string, endpoint: string) => Promise<void>;
  inspectPoll: (requestId: string, secretHash: string) => Promise<WebLoginChallengeView | null>;
  approve: (input: {
    accountEmail: string;
    approvalSecretHash: string;
    magicLinkTokenHash: string;
    requestId: string;
    userId: string;
  }) => Promise<boolean>;
  approveCode: (input: {
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
  createApprovalCode?: () => string;
  createSecret?: () => string;
  generateMagicLinkTokenHash: (email: string) => Promise<string>;
  hashLoginCode: (requestId: string, code: string) => Promise<string>;
  resolveUserIdByEmail: (email: string) => Promise<string | null>;
  sendLoginPush?: (
    userId: string,
    notification: { expiresAt: string; originHost: string; requestId: string },
  ) => Promise<void>;
  hashSecret?: (secret: string) => Promise<string>;
  now?: () => Date;
  store: WebLoginChallengeStore;
};

type RequestBody = {
  action?: unknown;
  code?: unknown;
  email?: unknown;
  endpoint?: unknown;
  requestId?: unknown;
  secret?: unknown;
  subscription?: unknown;
};

const MAX_CODE_ATTEMPTS = 5;

export function createWebLoginHandler(dependencies: WebLoginDependencies) {
  const createSecret = dependencies.createSecret ?? generateSecret;
  const createApprovalCode = dependencies.createApprovalCode ?? generateLoginCode;
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
        case 'start-code':
          return await startCodeChallenge(
            request,
            dependencies,
            body,
            createSecret,
            createApprovalCode,
            hashSecret,
            now,
          );
        case 'inspect':
          return await inspectChallenge(request, dependencies.store, body, hashSecret, now);
        case 'approve':
          return await approveChallenge(request, dependencies, body, hashSecret, now);
        case 'pending-code-approvals':
          return await listPendingCodeApprovals(request, dependencies, now);
        case 'approve-code':
          return await approveCodeChallenge(request, dependencies, body, now);
        case 'reject-code':
          return await rejectCodeApproval(request, dependencies, body, now);
        case 'register-push':
          return await registerPushSubscription(request, dependencies, body);
        case 'unregister-push':
          return await removePushSubscription(request, dependencies, body);
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

async function startCodeChallenge(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
  createSecret: () => string,
  createApprovalCode: () => string,
  hashSecret: (secret: string) => Promise<string>,
  now: () => Date,
): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const approvalCode = createApprovalCode();
  const pollSecret = createSecret();
  if (!/^\d{6}$/.test(approvalCode) || !isSecret(pollSecret)) {
    throw new Error('Could not create a login code.');
  }

  const currentTime = now();
  await dependencies.store.cleanupExpired(currentTime.toISOString());

  const targetUserId = await dependencies.resolveUserIdByEmail(email);
  const requestId = crypto.randomUUID();
  const expiresAt = new Date(currentTime.getTime() + WEB_LOGIN_LIFETIME_MS).toISOString();
  const originHost = getOriginHost(request.headers.get('origin'));
  const challenge = await dependencies.store.createCodeChallenge({
    approvalSecretHash: await dependencies.hashLoginCode(requestId, approvalCode),
    expiresAt,
    originHost,
    pollSecretHash: await hashSecret(pollSecret),
    requestId,
    targetUserId,
  });

  if (challenge.notificationUserId && dependencies.sendLoginPush) {
    try {
      await dependencies.sendLoginPush(challenge.notificationUserId, {
        expiresAt,
        originHost,
        requestId: challenge.requestId,
      });
    } catch {
      // The authenticated mobile inbox remains available if a push endpoint is unavailable.
    }
  }

  return jsonResponse(
    request,
    { code: approvalCode, expiresAt, pollSecret, requestId: challenge.requestId },
    201,
  );
}

async function listPendingCodeApprovals(
  request: Request,
  dependencies: WebLoginDependencies,
  now: () => Date,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, dependencies);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const approvals = await dependencies.store.listPendingCodeApprovals(
    user.id,
    now().toISOString(),
  );
  return jsonResponse(request, { requests: approvals });
}

async function approveCodeChallenge(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
  now: () => Date,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, dependencies);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  const code = typeof body.code === 'string' ? body.code : '';
  if (!isUuid(requestId) || !/^\d{6}$/.test(code)) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const currentTime = now();
  const challenge = await dependencies.store.inspectCodeApproval(
    requestId,
    user.id,
    currentTime.toISOString(),
  );
  if (!isPending(challenge, currentTime) || challenge.failedAttempts >= MAX_CODE_ATTEMPTS) {
    return jsonResponse(request, { status: 'expired' });
  }

  const suppliedHash = await dependencies.hashLoginCode(requestId, code);
  if (!constantTimeEqual(suppliedHash, challenge.approvalSecretHash)) {
    const failedAttempts = await dependencies.store.recordFailedCodeAttempt(
      requestId,
      user.id,
      currentTime.toISOString(),
    );
    return jsonResponse(
      request,
      failedAttempts === null || failedAttempts >= MAX_CODE_ATTEMPTS
        ? { status: 'locked' }
        : { attemptsRemaining: MAX_CODE_ATTEMPTS - failedAttempts, status: 'invalid-code' },
    );
  }

  const accountEmail = user.email?.trim();
  if (!accountEmail) {
    return jsonResponse(request, { error: 'An email account is required.' }, 403);
  }

  const magicLinkTokenHash = await dependencies.generateMagicLinkTokenHash(accountEmail);
  const approved = await dependencies.store.approveCode({
    accountEmail,
    approvalSecretHash: challenge.approvalSecretHash,
    magicLinkTokenHash,
    requestId,
    userId: user.id,
  });
  return jsonResponse(request, { status: approved ? 'approved' : 'expired' });
}

async function rejectCodeApproval(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
  now: () => Date,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, dependencies);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  if (typeof body.requestId !== 'string' || !isUuid(body.requestId)) {
    return jsonResponse(request, { error: 'Invalid request.' }, 400);
  }

  const rejected = await dependencies.store.rejectCodeApproval(
    body.requestId,
    user.id,
    now().toISOString(),
  );
  return jsonResponse(request, { status: rejected ? 'rejected' : 'expired' });
}

async function registerPushSubscription(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, dependencies);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const subscription = parsePushSubscription(body.subscription);
  if (!subscription) {
    return jsonResponse(request, { error: 'Invalid push subscription.' }, 400);
  }

  await dependencies.store.registerPushSubscription(user.id, subscription);
  return jsonResponse(request, { status: 'registered' });
}

async function removePushSubscription(
  request: Request,
  dependencies: WebLoginDependencies,
  body: RequestBody,
): Promise<Response> {
  const user = await getAuthenticatedUser(request, dependencies);
  if (!user) {
    return jsonResponse(request, { error: 'Authentication required.' }, 401);
  }

  const endpoint = typeof body.endpoint === 'string' ? getAllowedPushEndpoint(body.endpoint) : null;
  if (!endpoint) {
    return jsonResponse(request, { error: 'Invalid push subscription.' }, 400);
  }

  await dependencies.store.removePushSubscription(user.id, endpoint);
  return jsonResponse(request, { status: 'unregistered' });
}

async function getAuthenticatedUser(
  request: Request,
  dependencies: WebLoginDependencies,
): Promise<WebLoginUser | null> {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
    return null;
  }
  return dependencies.authenticateUser(request);
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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parsePushSubscription(value: unknown): WebLoginPushSubscription | null {
  if (!isRecord(value) || !isRecord(value.keys) || typeof value.endpoint !== 'string') {
    return null;
  }

  const endpoint = getAllowedPushEndpoint(value.endpoint);
  const { auth, p256dh } = value.keys;
  if (
    !endpoint ||
    typeof auth !== 'string' ||
    !/^[A-Za-z0-9_-]{16,30}$/.test(auth) ||
    typeof p256dh !== 'string' ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh)
  ) {
    return null;
  }

  return { endpoint, keys: { auth, p256dh } };
}

function getAllowedPushEndpoint(value: string): string | null {
  if (value.length > 2048) {
    return null;
  }

  try {
    const endpoint = new URL(value);
    const host = endpoint.hostname.toLowerCase();
    const isKnownPushHost =
      host === 'fcm.googleapis.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host === 'push.services.mozilla.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host.endsWith('.notify.windows.com') ||
      host === 'push.services.opera.com';
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      !isKnownPushHost
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function generateLoginCode(): string {
  const upperBound = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= upperBound);
  return String(sample[0] % 1_000_000).padStart(6, '0');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
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