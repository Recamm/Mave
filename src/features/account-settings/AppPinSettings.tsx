import { useId, useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { useAppPinAccess } from '../../app/AppPinAccessContext';
import { useAuthSession } from '../../app/useAuthSession';
import { appPinService, APP_PIN_LENGTH } from '../auth/appPinService';

export function AppPinSettings() {
  const idPrefix = useId();
  const { session } = useAuthSession();
  const userId = session?.user.id;
  const [isEnabled, setIsEnabled] = useState(() =>
    userId ? appPinService.isEnabled(userId) : false,
  );
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'info' } | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const { setUnlockedUserId } = useAppPinAccess();

  function handleToggle(enabled: boolean) {
    setFeedback(null);

    if (enabled) {
      setIsConfiguring(true);
      return;
    }

    if (isEnabled && userId) {
      try {
        appPinService.clearPin(userId);
        setIsEnabled(false);
      } catch {
        setFeedback({ message: 'No se pudo desactivar el PIN.', tone: 'error' });
        return;
      }
    }

    setIsConfiguring(false);
    setPin('');
    setConfirmation('');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) {
      return;
    }

    setFeedback(null);
    if (pin.length !== APP_PIN_LENGTH || pin !== confirmation) {
      setFeedback({
        message:
          pin.length !== APP_PIN_LENGTH
            ? 'El PIN debe tener seis dígitos.'
            : 'Los PIN no coinciden.',
        tone: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      await appPinService.setPin(userId, pin);
      setIsEnabled(true);
      setIsConfiguring(false);
      setPin('');
      setConfirmation('');
      setUnlockedUserId(userId);
      setFeedback({ message: 'El PIN quedó activado en este dispositivo.', tone: 'info' });
    } catch {
      setFeedback({
        message: 'No se pudo guardar el PIN. Inténtalo de nuevo.',
        tone: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-pin-settings">
      <label className="app-pin-settings__toggle" htmlFor={`${idPrefix}-enabled`}>
        <span>
          <strong>Solicitar PIN al abrir Mave</strong>
          <span>{isEnabled ? 'Activo en este navegador' : 'Se guarda solo en este navegador'}</span>
        </span>
        <input
          checked={isEnabled || isConfiguring}
          id={`${idPrefix}-enabled`}
          onChange={(event) => handleToggle(event.target.checked)}
          type="checkbox"
        />
      </label>

      {isEnabled && !isConfiguring ? (
        <button
          className="app-pin-settings__change"
          onClick={() => setIsConfiguring(true)}
          type="button"
        >
          Cambiar PIN
        </button>
      ) : null}

      {isConfiguring ? (
        <form aria-label="Configurar PIN de acceso" onSubmit={handleSave}>
          <label htmlFor={`${idPrefix}-pin`}>
            {isEnabled ? 'PIN nuevo' : 'PIN de seis dígitos'}
          </label>
          <input
            autoComplete="new-password"
            id={`${idPrefix}-pin`}
            inputMode="numeric"
            maxLength={APP_PIN_LENGTH}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            pattern={`[0-9]{${APP_PIN_LENGTH}}`}
            required
            type="password"
            value={pin}
          />
          <label htmlFor={`${idPrefix}-confirmation`}>Repite el PIN</label>
          <input
            autoComplete="new-password"
            id={`${idPrefix}-confirmation`}
            inputMode="numeric"
            maxLength={APP_PIN_LENGTH}
            onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ''))}
            pattern={`[0-9]{${APP_PIN_LENGTH}}`}
            required
            type="password"
            value={confirmation}
          />
          <div className="app-pin-settings__actions">
            <button disabled={isSaving} type="submit">
              {isSaving ? 'Guardando…' : 'Guardar PIN'}
            </button>
            <button disabled={isSaving} onClick={() => handleToggle(false)} type="button">
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? <FeedbackMessage tone={feedback.tone}>{feedback.message}</FeedbackMessage> : null}
    </div>
  );
}
