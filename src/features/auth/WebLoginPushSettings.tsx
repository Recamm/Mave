import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { webLoginService, type WebLoginPushSubscription } from './webLoginService';

type PushSettingsState = 'checking' | 'disabled' | 'enabled' | 'denied' | 'unsupported' | 'error';

const applicationServerKey =
  import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ||
  'BB90M0jIFd6ZK1lZ_zcxX4cxQZy4a11bV5fAX9P-Iv9ElNrXyi7Ecsc87DTgKoE2FjHSu608NNmSr5ofYpR-O_Y';

export function WebLoginPushSettings() {
  const [state, setState] = useState<PushSettingsState>('checking');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSubscription() {
      if (!supportsPush()) {
        setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const currentSubscription = await registration.pushManager.getSubscription();
        if (!isActive) {
          return;
        }

        setSubscription(currentSubscription);
        if (currentSubscription) {
          const payload = toPushSubscriptionPayload(currentSubscription);
          if (!payload) {
            setState('error');
            return;
          }
          await webLoginService.registerPushSubscription(payload);
          if (isActive) {
            setState('enabled');
          }
        } else {
          setState('disabled');
        }
      } catch {
        if (isActive) {
          setState('error');
        }
      }
    }

    void loadSubscription();
    return () => {
      isActive = false;
    };
  }, []);

  async function enableNotifications() {
    if (!supportsPush() || !applicationServerKey) {
      return;
    }

    setState('checking');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const currentSubscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          applicationServerKey: decodeApplicationServerKey(applicationServerKey),
          userVisibleOnly: true,
        }));
      const payload = toPushSubscriptionPayload(currentSubscription);
      if (!payload) {
        throw new Error('The browser returned an invalid push subscription.');
      }

      await webLoginService.registerPushSubscription(payload);
      setSubscription(currentSubscription);
      setState('enabled');
    } catch {
      setState('error');
    }
  }

  async function disableNotifications() {
    if (!subscription) {
      setState('disabled');
      return;
    }

    setState('checking');
    try {
      await webLoginService.removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscription(null);
      setState('disabled');
    } catch {
      setState('error');
    }
  }

  const isChecking = state === 'checking';
  const isEnabled = state === 'enabled';
  const canEnable = Boolean(applicationServerKey) && state !== 'unsupported' && state !== 'denied';

  return (
    <div aria-busy={isChecking} className="web-login-push-settings">
      <div className="web-login-push-settings__copy">
        <h3>Notificaciones de acceso</h3>
        <p>Recibe solicitudes de inicio de sesión cuando Mave esté cerrada en este dispositivo.</p>
      </div>

      {isChecking ? <LoadingIndicator label="Comprobando notificaciones" /> : null}
      {state === 'unsupported' ? (
        <FeedbackMessage tone="info">
          Este navegador no admite notificaciones push para Mave.
        </FeedbackMessage>
      ) : null}
      {state === 'denied' ? (
        <FeedbackMessage tone="info">
          Las notificaciones están bloqueadas en el navegador. Permítelas en los ajustes del sitio.
        </FeedbackMessage>
      ) : null}
      {!applicationServerKey && state === 'disabled' ? (
        <FeedbackMessage tone="info">
          Las notificaciones push no están configuradas en este despliegue.
        </FeedbackMessage>
      ) : null}
      {state === 'error' ? (
        <FeedbackMessage tone="error">
          No se pudieron actualizar las notificaciones. Comprueba la conexión e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}

      <button
        className="web-login-push-settings__button"
        disabled={isChecking || (!isEnabled && !canEnable)}
        onClick={() => void (isEnabled ? disableNotifications() : enableNotifications())}
        type="button"
      >
        {isEnabled ? (
          <BellOff aria-hidden="true" size={18} />
        ) : (
          <Bell aria-hidden="true" size={18} />
        )}
        <span>{isEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}</span>
      </button>
    </div>
  );
}

function supportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function decodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = atob(padded);
  const key = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    key[index] = decoded.charCodeAt(index);
  }
  return key;
}

function toPushSubscriptionPayload(
  subscription: PushSubscription,
): WebLoginPushSubscription | null {
  const value = subscription.toJSON();
  const auth = value.keys?.auth;
  const p256dh = value.keys?.p256dh;
  if (!subscription.endpoint || !auth || !p256dh) {
    return null;
  }
  return { endpoint: subscription.endpoint, keys: { auth, p256dh } };
}
