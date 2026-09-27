import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { webLoginService, type WebLoginRequest } from './webLoginService';

type QrPanelState = 'starting' | 'pending' | 'expired' | 'failed' | 'complete';
type ManualCodeCopyState = 'idle' | 'copied' | 'failed';

export function WebLoginQrPanel() {
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<WebLoginRequest | null>(null);
  const [state, setState] = useState<QrPanelState>('starting');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [manualCodeCopyState, setManualCodeCopyState] = useState<ManualCodeCopyState>('idle');

  useEffect(() => {
    let isActive = true;
    setRequest(null);
    setRemainingSeconds(null);
    setState('starting');

    void webLoginService
      .start()
      .then((result) => {
        if (isActive) {
          setRequest(result);
          setState('pending');
        }
      })
      .catch(() => {
        if (isActive) {
          setState('failed');
        }
      });

    return () => {
      isActive = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!request) {
      return;
    }
    const activeRequest = request;

    function updateRemainingTime() {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(activeRequest.expiresAt) - Date.now()) / 1000),
      );
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        setState((currentState) => (currentState === 'pending' ? 'expired' : currentState));
      }
    }

    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(timer);
  }, [request]);

  useEffect(() => {
    if (!request || state !== 'pending') {
      return;
    }
    const activeRequest = request;

    let isActive = true;
    let isPolling = false;

    async function poll() {
      if (isPolling) {
        return;
      }
      isPolling = true;

      try {
        const result = await webLoginService.poll(
          activeRequest.requestId,
          activeRequest.pollSecret,
        );
        if (!isActive) {
          return;
        }
        if (result === 'expired') {
          setState('expired');
        } else if (result === 'authenticated') {
          setState('complete');
        }
      } catch {
        if (isActive) {
          setState('failed');
        }
      } finally {
        isPolling = false;
      }
    }

    const timer = window.setInterval(() => void poll(), 1800);
    void poll();

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [request, state]);

  const approvalUrl = request ? createApprovalUrl(request) : null;
  const manualCode = request ? `${request.requestId}:${request.approvalSecret}` : null;

  async function copyManualCode() {
    if (!manualCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(manualCode);
      setManualCodeCopyState('copied');
    } catch {
      setManualCodeCopyState('failed');
    }
  }

  return (
    <section aria-labelledby="auth-qr-title" className="auth-qr">
      <h2 id="auth-qr-title">Iniciar sesión con QR</h2>
      {state === 'starting' ? <LoadingIndicator label="Generando un código temporal" /> : null}
      {state === 'pending' && approvalUrl ? (
        <QRCodeSVG
          bgColor="#ffffff"
          className="auth-qr__code"
          fgColor="#17141b"
          includeMargin
          level="M"
          size={224}
          title="Código QR para iniciar sesión en Mave"
          value={approvalUrl}
        />
      ) : null}
      {state === 'pending' && manualCode ? (
        <div className="auth-qr__manual">
          <div className="auth-qr__manual-heading">
            <strong>¿No funciona la cámara?</strong>
            <span>Pega este código en Configuración → Seguridad del celular.</span>
          </div>
          <div className="auth-qr__manual-value">
            <code>{manualCode}</code>
            <button
              aria-label="Copiar código manual"
              className="auth-qr__copy-button"
              onClick={() => void copyManualCode()}
              type="button"
            >
              {manualCodeCopyState === 'copied' ? (
                <Check aria-hidden="true" size={17} />
              ) : (
                <Copy aria-hidden="true" size={17} />
              )}
              <span>{manualCodeCopyState === 'copied' ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
          {manualCodeCopyState === 'failed' ? (
            <p className="auth-qr__manual-feedback">
              No se pudo copiar. Selecciona el código y cópialo manualmente.
            </p>
          ) : null}
        </div>
      ) : null}
      {state === 'pending' ? (
        <p className="auth-qr__copy">
          Escanea con tu celular e identifica el equipo antes de aprobar el acceso.
        </p>
      ) : null}
      {state === 'pending' && remainingSeconds !== null ? (
        <p aria-live="polite" className="auth-qr__expiry">
          Vence en {Math.floor(remainingSeconds / 60)}:
          {String(remainingSeconds % 60).padStart(2, '0')}
        </p>
      ) : null}
      {state === 'expired' ? (
        <FeedbackMessage tone="info">El código venció. Genera otro para continuar.</FeedbackMessage>
      ) : null}
      {state === 'failed' ? (
        <FeedbackMessage tone="error">
          No se pudo iniciar el acceso con QR. Comprueba la conexión e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}
      {state === 'complete' ? (
        <FeedbackMessage tone="info">Sesión iniciada. Abriendo Mave…</FeedbackMessage>
      ) : null}
      {state === 'expired' || state === 'failed' ? (
        <button
          className="auth-qr__retry"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
          <span>Generar otro QR</span>
        </button>
      ) : null}
    </section>
  );
}

function createApprovalUrl(request: WebLoginRequest): string {
  const url = new URL('/login/approve', window.location.origin);
  url.hash = new URLSearchParams({
    approval: request.approvalSecret,
    request: request.requestId,
  }).toString();
  return url.toString();
}
