interface ServiceWorkerLifecycleEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface ServiceWorkerFetchEvent extends ServiceWorkerLifecycleEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface ServiceWorkerWindowClient {
  focus(): Promise<ServiceWorkerWindowClient>;
  navigate?(url: string): Promise<ServiceWorkerWindowClient | null>;
  postMessage(message: unknown): void;
  url: string;
}

interface ServiceWorkerRuntime extends EventTarget {
  clients: {
    claim(): Promise<void>;
    matchAll(options: {
      includeUncontrolled: boolean;
      type: 'window';
    }): Promise<ServiceWorkerWindowClient[]>;
    openWindow(url: string): Promise<ServiceWorkerWindowClient | null>;
  };
  registration: {
    scope: string;
    showNotification(title: string, options: NotificationOptions): Promise<void>;
  };
  skipWaiting(): Promise<void>;
}

interface ServiceWorkerPushEvent extends ServiceWorkerLifecycleEvent {
  data: { json(): unknown } | null;
}

interface ServiceWorkerNotificationClickEvent extends ServiceWorkerLifecycleEvent {
  notification: { close(): void; data?: unknown };
}

const worker = self as unknown as ServiceWorkerRuntime;
const cacheName = 'mave-shell-v1';
const appScope = worker.registration.scope;
const appShellUrl = new URL('./', appScope).toString();
const staticAssetPath = new URL('assets/', appScope).pathname;
const iconAssetPath = new URL('icons/', appScope).pathname;
const approvalInboxUrl = new URL('?webLoginApproval=1', appScope).toString();

worker.addEventListener('install', (event) => {
  (event as ServiceWorkerLifecycleEvent).waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await cache.addAll([
        appShellUrl,
        new URL('manifest.webmanifest', appScope).toString(),
        new URL('icons/mave.svg', appScope).toString(),
        new URL('icons/icon-192.png', appScope).toString(),
        new URL('icons/icon-512.png', appScope).toString(),
        new URL('icons/apple-touch-icon.png', appScope).toString(),
        new URL('icons/apple-touch-icon-dark.png', appScope).toString(),
        new URL('icons/apple-touch-icon-light.png', appScope).toString(),
      ]);
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener('activate', (event) => {
  (event as ServiceWorkerLifecycleEvent).waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('mave-shell-') && name !== cacheName)
          .map((name) => caches.delete(name)),
      );
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('push', (event) => {
  (event as ServiceWorkerPushEvent).waitUntil(
    (async () => {
      const pushEvent = event as ServiceWorkerPushEvent;
      let payload: unknown;
      try {
        payload = pushEvent.data?.json();
      } catch {
        return;
      }
      if (isRecurringMovementReminderPush(payload)) {
        const title = payload.kind === 'income' ? 'Cobro próximo' : 'Pago próximo';
        await worker.registration.showNotification(title, {
          body: `${payload.label}: ${payload.amount} ${payload.currency}, vence el ${payload.dueOn}.`,
          data: {
            url: new URL(
              `?recurringId=${encodeURIComponent(payload.recurringMovementId)}`,
              appScope,
            ).toString(),
          },
          icon: new URL('icons/icon-192.png', appScope).toString(),
          tag: `recurring-${payload.recurringMovementId}-${payload.dueOn}`,
        });
        return;
      }
      if (!isWebLoginPush(payload)) {
        return;
      }

      const clients = await worker.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      const appClients = clients.filter(isAppClient);
      if (appClients.length > 0) {
        for (const client of appClients) {
          client.postMessage({ requestId: payload.requestId, type: 'web-login-code-pending' });
        }
        return;
      }

      await worker.registration.showNotification('Solicitud de inicio de sesión', {
        body: 'Hay un intento de acceso. Abre Mave para revisar y autorizar la solicitud.',
        data: { url: approvalInboxUrl },
        icon: new URL('icons/icon-192.png', appScope).toString(),
        tag: 'web-login-code',
      });
    })(),
  );
});

worker.addEventListener('notificationclick', (event) => {
  const clickEvent = event as ServiceWorkerNotificationClickEvent;
  clickEvent.notification.close();
  clickEvent.waitUntil(
    (async () => {
      const clients = await worker.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      const appClient = clients.find(isAppClient);
      const targetUrl = notificationTargetUrl(clickEvent.notification.data);
      if (appClient) {
        try {
          await appClient.navigate?.(targetUrl);
        } catch {
          if (targetUrl === approvalInboxUrl) {
            appClient.postMessage({ type: 'web-login-code-pending' });
          }
        }
        await appClient.focus();
        return;
      }

      await worker.clients.openWindow(targetUrl);
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  const fetchEvent = event as ServiceWorkerFetchEvent;
  const requestUrl = new URL(fetchEvent.request.url);

  if (fetchEvent.request.method !== 'GET' || requestUrl.origin !== new URL(appScope).origin) {
    return;
  }

  if (
    fetchEvent.request.mode === 'navigate' &&
    requestUrl.pathname.startsWith(new URL(appScope).pathname)
  ) {
    fetchEvent.respondWith(
      fetch(fetchEvent.request).catch(async () => {
        const cache = await caches.open(cacheName);
        const shell = await cache.match(appShellUrl);
        return shell ?? new Response('Mave is unavailable offline.', { status: 503 });
      }),
    );
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith(staticAssetPath) ||
    requestUrl.pathname.startsWith(iconAssetPath);

  if (!isStaticAsset) {
    return;
  }

  fetchEvent.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(fetchEvent.request);

      if (cached) {
        return cached;
      }

      const response = await fetch(fetchEvent.request);
      if (response.ok) {
        await cache.put(fetchEvent.request, response.clone());
      }
      return response;
    })(),
  );
});

function isWebLoginPush(value: unknown): value is { requestId: string; type: 'web-login-code' } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    payload.type === 'web-login-code' &&
    typeof payload.requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.requestId,
    )
  );
}

function isRecurringMovementReminderPush(value: unknown): value is {
  amount: string;
  currency: 'ARS' | 'USD';
  dueOn: string;
  kind: 'income' | 'expense';
  label: string;
  recurringMovementId: string;
  type: 'recurring-movement-reminder';
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    payload.type === 'recurring-movement-reminder' &&
    typeof payload.amount === 'string' &&
    (payload.currency === 'ARS' || payload.currency === 'USD') &&
    typeof payload.dueOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(payload.dueOn) &&
    (payload.kind === 'income' || payload.kind === 'expense') &&
    typeof payload.label === 'string' &&
    typeof payload.recurringMovementId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.recurringMovementId,
    )
  );
}

function notificationTargetUrl(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('url' in value)) {
    return approvalInboxUrl;
  }

  try {
    const targetUrl = new URL(String(value.url), appScope);
    const scopeUrl = new URL(appScope);
    return targetUrl.origin === scopeUrl.origin && targetUrl.pathname.startsWith(scopeUrl.pathname)
      ? targetUrl.toString()
      : approvalInboxUrl;
  } catch {
    return approvalInboxUrl;
  }
}

function isAppClient(client: ServiceWorkerWindowClient): boolean {
  try {
    const clientUrl = new URL(client.url);
    const scopeUrl = new URL(appScope);
    return clientUrl.origin === scopeUrl.origin && clientUrl.pathname.startsWith(scopeUrl.pathname);
  } catch {
    return false;
  }
}
