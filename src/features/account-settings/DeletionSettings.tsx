import { useEffect, useRef, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { deletionService } from './deletionService';

type AccountLifecycle = NonNullable<Awaited<ReturnType<typeof deletionService.getStatus>>>;

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value));
}

export function DeletionSettings() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lifecycle, setLifecycle] = useState<AccountLifecycle | null>(null);
  const [accountSyncAllowed, setAccountSyncAllowed] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [requestError, setRequestError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([deletionService.getStatus(), deletionService.accountSyncAllowed()])
      .then(([status, syncAllowed]) => {
        if (isCurrent) {
          setLifecycle(status);
          setAccountSyncAllowed(syncAllowed);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setStatusError(true);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const hasActiveRequest = Boolean(
    lifecycle?.deletion_requested_at && !lifecycle.deletion_canceled_at,
  );
  const hasStarted = Boolean(lifecycle?.deletion_started_at);
  const dueAt = lifecycle?.deletion_due_at ?? null;
  const hasValidDeadline = Boolean(dueAt && Number.isFinite(Date.parse(dueAt)));
  const hasExpired = hasActiveRequest && accountSyncAllowed === false;
  const canCancel =
    hasActiveRequest && !hasStarted && hasValidDeadline && accountSyncAllowed === true;

  let statusLabel = 'Cuenta activa';
  if (hasStarted) {
    statusLabel = 'Eliminación en proceso';
  } else if (hasExpired) {
    statusLabel = 'La fecha límite venció';
  } else if (hasActiveRequest) {
    statusLabel = 'Eliminación solicitada';
  }

  async function handleRequest() {
    setRequestError(false);
    setIsSubmitting(true);

    try {
      const updatedLifecycle = await deletionService.requestDeletion();
      setLifecycle(updatedLifecycle);
      dialogRef.current?.close();
    } catch {
      setRequestError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    setRequestError(false);
    setIsSubmitting(true);

    try {
      setLifecycle(await deletionService.cancelDeletion());
    } catch {
      setRequestError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div aria-busy={isLoading || isSubmitting} className="deletion-settings">
      <p aria-live="polite" className="deletion-settings__status">
        {isLoading ? 'Consultando estado...' : statusLabel}
      </p>
      {dueAt ? (
        <p className="deletion-settings__deadline">
          Fecha límite: <time dateTime={dueAt}>{formatDeadline(dueAt)}</time>
        </p>
      ) : null}

      {statusError ? (
        <FeedbackMessage tone="error">
          No se pudo consultar el estado de eliminación. Comprueba la conexión e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}
      {requestError ? (
        <FeedbackMessage tone="error">
          No se pudo actualizar la solicitud. Comprueba la conexión y vuelve a intentarlo.
        </FeedbackMessage>
      ) : null}

      <div className="deletion-settings__actions">
        {!isLoading && !statusError && !hasActiveRequest && !hasStarted ? (
          <button onClick={() => dialogRef.current?.showModal()} type="button">
            Solicitar eliminación
          </button>
        ) : null}
        {canCancel ? (
          <button disabled={isSubmitting} onClick={() => void handleCancel()} type="button">
            Cancelar solicitud
          </button>
        ) : null}
      </div>

      <dialog
        aria-labelledby="account-deletion-confirmation-heading"
        className="data-export-dialog"
        ref={dialogRef}
      >
        <header className="data-export-dialog__heading">
          <h2 id="account-deletion-confirmation-heading">Confirmar eliminación de cuenta</h2>
          <button disabled={isSubmitting} onClick={() => dialogRef.current?.close()} type="button">
            Cerrar
          </button>
        </header>
        <p>
          La solicitud conserva tus datos durante 30 días calendario. Puedes cancelarla hasta la
          fecha límite.
        </p>
        <p className="deletion-settings__warning">
          Un dispositivo que no vuelva a conectarse puede conservar datos locales hasta que se
          borren sus datos.
        </p>
        {requestError ? (
          <FeedbackMessage tone="error">
            No se pudo enviar la solicitud. Comprueba la conexión y vuelve a intentarlo.
          </FeedbackMessage>
        ) : null}
        <div aria-busy={isSubmitting} className="deletion-settings__actions">
          <button disabled={isSubmitting} onClick={() => void handleRequest()} type="button">
            {isSubmitting ? 'Enviando solicitud...' : 'Confirmar solicitud'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
