interface ServiceWorkerLifecycleEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface ServiceWorkerFetchEvent extends ServiceWorkerLifecycleEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface ServiceWorkerRuntime extends EventTarget {
  clients: { claim(): Promise<void> };
  registration: { scope: string };
  skipWaiting(): Promise<void>;
}

const worker = self as unknown as ServiceWorkerRuntime;
const cacheName = 'mave-shell-v1';
const appScope = worker.registration.scope;
const appShellUrl = new URL('./', appScope).toString();
const staticAssetPath = new URL('assets/', appScope).pathname;
const iconAssetPath = new URL('icons/', appScope).pathname;

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
