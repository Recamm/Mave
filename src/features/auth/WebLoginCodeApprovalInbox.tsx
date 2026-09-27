import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { webLoginService, type WebLoginPendingCodeApproval } from './webLoginService';

type ApprovalResolution = 'approved' | 'expired' | 'locked' | 'rejected';

export function WebLoginCodeApprovalInbox() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [requests, setRequests] = useState<WebLoginPendingCodeApproval[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState<ApprovalResolution | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeRequest = requests[0] ?? null;

  useEffect(() => {
    let isActive = true;
    let isPolling = false;

    async function refreshApprovals() {
      if (isPolling) {
        return;
      }
      isPolling = true;
      try {
        const pendingRequests = await webLoginService.listPendingCodeApprovals();
        if (isActive) {
          setRequests(
            [...pendingRequests].sort(
              (first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt),
            ),
          );
          setError('');
        }
      } catch {
        if (isActive) {
          setError('No se pudieron consultar las solicitudes de acceso.');
        }
      } finally {
        isPolling = false;
      }
    }

    function handleServiceWorkerMessage(event: MessageEvent) {
      const message = event.data as { type?: unknown } | null;
      if (message?.type === 'web-login-code-pending') {
        void refreshApprovals();
      }
    }

    const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    void refreshApprovals();
    const timer = window.setInterval(() => void refreshApprovals(), 2500);
    return () => {
      isActive = false;
      window.clearInterval(timer);
      serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if ((activeRequest || resolution) && !dialog.open) {
      dialog.showModal();
    } else if (!activeRequest && !resolution && dialog.open) {
      dialog.close();
    }
  }, [activeRequest, resolution]);

  function removeActiveRequest() {
    if (activeRequest) {
      setRequests((current) =>
        current.filter((request) => request.requestId !== activeRequest.requestId),
      );
    }
    setCode('');
    setError('');
  }

  async function handleApprove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeRequest || !/^\d{6}$/.test(code) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const result = await webLoginService.approveCode(activeRequest.requestId, code);
      if (result.status === 'invalid-code') {
        setError(
          result.attemptsRemaining === undefined
            ? 'El código no coincide. Inténtalo de nuevo.'
            : `El código no coincide. Quedan ${result.attemptsRemaining} intentos.`,
        );
      } else {
        setResolution(result.status);
        removeActiveRequest();
      }
    } catch {
      setError('No se pudo verificar el código. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject() {
    if (!activeRequest || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const result = await webLoginService.rejectCode(activeRequest.requestId);
      setResolution(result === 'rejected' ? 'rejected' : 'expired');
      removeActiveRequest();
    } catch {
      setError('No se pudo rechazar el acceso. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function continueInbox() {
    setResolution(null);
    setCode('');
    setError('');
  }

  const resolutionMessage = {
    approved: 'Acceso autorizado. La sesión se abrirá en el PC.',
    expired: 'La solicitud venció antes de poder responder.',
    locked: 'La solicitud se bloqueó tras varios códigos incorrectos.',
    rejected: 'Solicitud rechazada. No se inició sesión en el PC.',
  };

  return (
    <dialog
      aria-labelledby={titleId}
      className="web-login-code-dialog"
      onCancel={(event) => event.preventDefault()}
      ref={dialogRef}
    >
      <header className="web-login-code-dialog__header">
        <div>
          <p className="eyebrow">Aprobación de acceso</p>
          <h2 id={titleId}>{resolution ? 'Solicitud respondida' : 'Autorizar inicio en PC'}</h2>
        </div>
        {resolution ? (
          <Check aria-hidden="true" size={22} />
        ) : (
          <ShieldCheck aria-hidden="true" size={22} />
        )}
      </header>

      {activeRequest && !resolution ? (
        <>
          <div className="web-login-code-dialog__target">
            <span>Equipo que solicita acceso</span>
            <strong>{activeRequest.originHost}</strong>
          </div>
          <form className="web-login-code-dialog__form" onSubmit={handleApprove}>
            <label htmlFor={`${titleId}-code`}>Código de 6 dígitos</label>
            <input
              autoComplete="one-time-code"
              autoFocus
              id={`${titleId}-code`}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                setError('');
              }}
              pattern="[0-9]{6}"
              required
              value={code}
            />
            {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}
            <button disabled={code.length !== 6 || isSubmitting} type="submit">
              <ShieldCheck aria-hidden="true" size={18} />
              <span>{isSubmitting ? 'Verificando…' : 'Autorizar acceso'}</span>
            </button>
            <button
              className="web-login-code-dialog__reject"
              disabled={isSubmitting}
              onClick={() => void handleReject()}
              type="button"
            >
              <X aria-hidden="true" size={18} />
              <span>Rechazar solicitud</span>
            </button>
          </form>
          <p className="web-login-code-dialog__notice">
            Autoriza solo si reconoces el equipo. El código vence pronto y se usa una sola vez.
          </p>
        </>
      ) : null}

      {resolution ? (
        <div className="web-login-code-dialog__resolution">
          <FeedbackMessage tone={resolution === 'approved' ? 'info' : 'error'}>
            {resolutionMessage[resolution]}
          </FeedbackMessage>
          <button onClick={continueInbox} type="button">
            {requests.length > 0 ? 'Ver siguiente solicitud' : 'Cerrar'}
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
