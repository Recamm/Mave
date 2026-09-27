import { useEffect, useId, useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { webLoginService, type WebLoginCodeRequest } from './webLoginService';

type CodeLoginState = 'idle' | 'starting' | 'pending' | 'expired' | 'failed' | 'complete';

export function WebLoginCodePanel({
  email,
  onEmailChange,
}: {
  email: string;
  onEmailChange: (email: string) => void;
}) {
  const idPrefix = useId();
  const [request, setRequest] = useState<WebLoginCodeRequest | null>(null);
  const [state, setState] = useState<CodeLoginState>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('starting');
    setRequest(null);

    try {
      const nextRequest = await webLoginService.startCode(email);
      setRequest(nextRequest);
      setState('pending');
    } catch {
      setState('failed');
    }
  }

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
        if (result === 'authenticated') {
          setState('complete');
        } else if (result === 'expired') {
          setState('expired');
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

  useEffect(() => {
    if (!request || state !== 'pending') {
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
        setState('expired');
      }
    }

    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(timer);
  }, [request, state]);

  function restart() {
    setRequest(null);
    setRemainingSeconds(null);
    setState('idle');
  }

  return (
    <section aria-labelledby="auth-code-title" className="auth-code-login">
      <h2 id="auth-code-title">Iniciar sesión con código</h2>
      {state === 'pending' && request ? (
        <>
          <p>Abre Mave en el celular con esta cuenta e introduce el código para autorizar el PC.</p>
          <output aria-label="Código de seis dígitos" className="auth-code-login__value">
            {request.code}
          </output>
          {remainingSeconds !== null ? (
            <p aria-live="polite" className="auth-code-login__expiry">
              Vence en {Math.floor(remainingSeconds / 60)}:
              {String(remainingSeconds % 60).padStart(2, '0')}
            </p>
          ) : null}
        </>
      ) : null}

      {state === 'starting' ? <LoadingIndicator label="Generando un código de acceso" /> : null}
      {state === 'complete' ? (
        <FeedbackMessage tone="info">Sesión iniciada. Abriendo Mave…</FeedbackMessage>
      ) : null}
      {state === 'expired' ? (
        <FeedbackMessage tone="info">
          El código venció. Solicita otro para continuar.
        </FeedbackMessage>
      ) : null}
      {state === 'failed' ? (
        <FeedbackMessage tone="error">
          No se pudo completar el acceso. Comprueba la conexión e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}

      {state === 'idle' || state === 'starting' || state === 'failed' ? (
        <form onSubmit={handleSubmit}>
          <label htmlFor={`${idPrefix}-email`}>Correo electrónico</label>
          <input
            autoComplete="email"
            id={`${idPrefix}-email`}
            onChange={(event) => onEmailChange(event.target.value)}
            required
            type="email"
            value={email}
          />
          <button disabled={state === 'starting'} type="submit">
            {state === 'starting' ? 'Generando…' : 'Mostrar código'}
          </button>
        </form>
      ) : null}

      {state === 'expired' || state === 'complete' ? (
        <button className="auth-code-login__restart" onClick={restart} type="button">
          Iniciar otra vez
        </button>
      ) : null}
    </section>
  );
}
