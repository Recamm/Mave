import { useId, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { AuthServiceError, authService } from '../auth/authService';

type SettingsFeedback = { message: string; tone: 'error' | 'info' } | null;

export function AccountAccessSettings({ currentEmail }: { currentEmail: string }) {
  const idPrefix = useId();
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailFeedback, setEmailFeedback] = useState<SettingsFeedback>(null);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<SettingsFeedback>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailFeedback(null);

    if (newEmail.trim().toLocaleLowerCase() === currentEmail.toLocaleLowerCase()) {
      setEmailFeedback({ message: 'El correo nuevo debe ser distinto al actual.', tone: 'error' });
      return;
    }

    setIsUpdatingEmail(true);

    try {
      await authService.signIn(currentEmail, emailPassword);
      await authService.updateEmail(newEmail);
      setEmailFeedback({
        message: 'Solicitud enviada. Revisa el correo de confirmación para completar el cambio.',
        tone: 'info',
      });
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      setEmailFeedback({
        message: getErrorMessage(error, 'No se pudo actualizar el correo. Inténtalo de nuevo.'),
        tone: 'error',
      });
    } finally {
      setIsUpdatingEmail(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword !== passwordConfirmation) {
      setPasswordFeedback({ message: 'Las contraseñas nuevas no coinciden.', tone: 'error' });
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await authService.signIn(currentEmail, currentPassword);
      await authService.updatePassword(newPassword);
      setPasswordFeedback({ message: 'La contraseña se actualizó.', tone: 'info' });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordConfirmation('');
    } catch (error) {
      setPasswordFeedback({
        message: getErrorMessage(error, 'No se pudo actualizar la contraseña. Inténtalo de nuevo.'),
        tone: 'error',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <div className="settings-access-list">
      <details className="settings-access-item">
        <summary>
          <span>Cambiar correo</span>
          <ChevronDown aria-hidden="true" className="settings-access-item__chevron" size={18} />
        </summary>
        <form
          aria-label="Cambiar correo"
          className="settings-access-form"
          onSubmit={handleEmailSubmit}
        >
          <label htmlFor={`${idPrefix}-new-email`}>Correo nuevo</label>
          <input
            autoComplete="email"
            id={`${idPrefix}-new-email`}
            onChange={(event) => setNewEmail(event.target.value)}
            required
            type="email"
            value={newEmail}
          />
          <label htmlFor={`${idPrefix}-email-password`}>Contraseña actual</label>
          <input
            autoComplete="current-password"
            id={`${idPrefix}-email-password`}
            onChange={(event) => setEmailPassword(event.target.value)}
            required
            type="password"
            value={emailPassword}
          />
          {emailFeedback ? (
            <FeedbackMessage tone={emailFeedback.tone}>{emailFeedback.message}</FeedbackMessage>
          ) : null}
          <button disabled={isUpdatingEmail} type="submit">
            {isUpdatingEmail ? 'Enviando solicitud...' : 'Solicitar cambio de correo'}
          </button>
        </form>
      </details>

      <details className="settings-access-item">
        <summary>
          <span>Cambiar contraseña</span>
          <ChevronDown aria-hidden="true" className="settings-access-item__chevron" size={18} />
        </summary>
        <form
          aria-label="Cambiar contraseña"
          className="settings-access-form"
          onSubmit={handlePasswordSubmit}
        >
          <label htmlFor={`${idPrefix}-current-password`}>Contraseña actual</label>
          <input
            autoComplete="current-password"
            id={`${idPrefix}-current-password`}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            type="password"
            value={currentPassword}
          />
          <label htmlFor={`${idPrefix}-new-password`}>Contraseña nueva</label>
          <input
            autoComplete="new-password"
            id={`${idPrefix}-new-password`}
            minLength={6}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <label htmlFor={`${idPrefix}-password-confirmation`}>Repetir contraseña nueva</label>
          <input
            autoComplete="new-password"
            id={`${idPrefix}-password-confirmation`}
            minLength={6}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            required
            type="password"
            value={passwordConfirmation}
          />
          {passwordFeedback ? (
            <FeedbackMessage tone={passwordFeedback.tone}>
              {passwordFeedback.message}
            </FeedbackMessage>
          ) : null}
          <button disabled={isUpdatingPassword} type="submit">
            {isUpdatingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </details>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthServiceError ? error.message : fallback;
}
