export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const appBase = new URL(import.meta.env.BASE_URL, document.baseURI);
  const scriptUrl = new URL('service-worker.js', appBase);

  void navigator.serviceWorker
    .register(scriptUrl, { scope: appBase.pathname })
    .catch(() => undefined);
}
