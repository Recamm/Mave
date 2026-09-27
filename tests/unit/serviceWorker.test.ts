import { afterEach, describe, expect, it, vi } from 'vitest';

const requestId = 'c22e553d-87b3-44c4-9c0d-0137c8881111';

function createWorkerHarness(appClients: Array<Record<string, unknown>> = []) {
  const worker = new EventTarget();
  const showNotification = vi.fn<(title: string, options: NotificationOptions) => Promise<void>>();
  const matchAll = vi.fn(async () => appClients);
  const openWindow = vi.fn(async () => null);
  const registration = {
    scope: 'https://mave.example/app/',
    showNotification,
  };
  Object.assign(worker, {
    clients: { claim: vi.fn(async () => undefined), matchAll, openWindow },
    registration,
    skipWaiting: vi.fn(async () => undefined),
  });
  return { matchAll, openWindow, registration, showNotification, worker };
}

async function dispatchAsyncEvent(
  target: EventTarget,
  type: string,
  properties: Record<string, unknown>,
): Promise<void> {
  let completion: Promise<unknown> | null = null;
  const event = new Event(type);
  Object.defineProperty(event, 'waitUntil', {
    value: (promise: Promise<unknown>) => {
      completion = promise;
    },
  });
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, { value });
  }
  target.dispatchEvent(event);
  await completion;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('service worker login push', () => {
  it('messages an open Mave client instead of showing a duplicate notification', async () => {
    const appClient = {
      focus: vi.fn(async () => appClient),
      navigate: vi.fn(async () => appClient),
      postMessage: vi.fn(),
      url: 'https://mave.example/app/profile',
    };
    const harness = createWorkerHarness([appClient]);
    vi.stubGlobal('self', harness.worker);
    await import('../../src/service-worker');

    await dispatchAsyncEvent(harness.worker, 'push', {
      data: { json: () => ({ requestId, type: 'web-login-code' }) },
    });

    expect(appClient.postMessage).toHaveBeenCalledWith({
      requestId,
      type: 'web-login-code-pending',
    });
    expect(harness.showNotification).not.toHaveBeenCalled();
  });

  it('shows generic notification text without including the login code', async () => {
    const harness = createWorkerHarness();
    vi.stubGlobal('self', harness.worker);
    await import('../../src/service-worker');

    await dispatchAsyncEvent(harness.worker, 'push', {
      data: { json: () => ({ requestId, type: 'web-login-code' }) },
    });

    expect(harness.showNotification).toHaveBeenCalledOnce();
    const notificationCall = harness.showNotification.mock.calls[0];
    expect(notificationCall).toBeDefined();
    const [title, options] = notificationCall!;
    expect(title).toBe('Solicitud de inicio de sesión');
    expect(options.body).not.toMatch(/\d{6}/);
    expect(JSON.stringify(options.data)).not.toMatch(/\d{6}/);
  });

  it('opens the approval inbox when the notification is clicked', async () => {
    const harness = createWorkerHarness();
    vi.stubGlobal('self', harness.worker);
    await import('../../src/service-worker');
    const close = vi.fn();

    await dispatchAsyncEvent(harness.worker, 'notificationclick', {
      notification: { close, data: { url: 'https://attacker.example/' } },
    });

    expect(close).toHaveBeenCalledOnce();
    expect(harness.openWindow).toHaveBeenCalledWith('https://mave.example/app/?webLoginApproval=1');
  });
});
