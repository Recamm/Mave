import { useId, useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { appPinService, APP_PIN_LENGTH } from './appPinService';
import { AuthServiceError, authService } from './authService';
import brandLogo from '../../../info/finanzas-pwa/assets/brand/logo.svg';

type AppPinLockScreenProps = {
  email?: string;
  onUnlock: () => void;
  userId: string;
};

export function AppPinLockScreen({ email, onUnlock, userId }: AppPinLockScreenProps) {
  const idPrefix = useId();
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      if (await appPinService.verifyPin(userId, pin)) {
        setPin('');
        onUnlock();
      } else {
        setFeedback('El PIN no es correcto.');
      }
    } catch {
      setFeedback('No se pudo comprobar el PIN. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      await authService.signIn(email, password);
      appPinService.clearPin(userId);
      onUnlock();
    } catch (error) {
      setFeedback(
        error instanceof AuthServiceError
          ? error.message
          : 'No se pudo verificar la cuenta. Inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-pin-lock-page">
      <section aria-labelledby="app-pin-lock-title" className="app-pin-lock-panel">
        <p className="eyebrow">Seguridad de la cuenta</p>
        <div className="auth-brand">
          <img alt="" src={brandLogo} />
          <span className="app-pin-lock-brand">Mave</span>
        </div>
        <h1 id="app-pin-lock-title">Introduce tu PIN</h1>
        <p className="app-pin-lock-copy">Esta cuenta está protegida en este dispositivo.</p>

        <form aria-label="Desbloquear Mave" className="app-pin-lock-form" onSubmit={handleUnlock}>
          <label htmlFor={`${idPrefix}-pin`}>PIN de seis dígitos</label>
          <input
            autoComplete="one-time-code"
            autoFocus
            id={`${idPrefix}-pin`}
            inputMode="numeric"
            maxLength={APP_PIN_LENGTH}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            pattern={`[0-9]{${APP_PIN_LENGTH}}`}
            required
            type="password"
            value={pin}
          />
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Comprobando…' : 'Entrar'}
          </button>
        </form>

        {feedback ? <FeedbackMessage tone="error">{feedback}</FeedbackMessage> : null}

        {email ? (
          <details className="app-pin-recovery">
            <summary>Olvidé mi PIN</summary>
            <form aria-label="Restablecer PIN" onSubmit={handleRecovery}>
              <p>Confirma la contraseña de tu cuenta para quitar el PIN de este dispositivo.</p>
              <label htmlFor={`${idPrefix}-password`}>Contraseña de la cuenta</label>
              <input
                autoComplete="current-password"
                id={`${idPrefix}-password`}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <button disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Verificando…' : 'Verificar y quitar PIN'}
              </button>
            </form>
          </details>
        ) : null}
      </section>
    </main>
  );
}
