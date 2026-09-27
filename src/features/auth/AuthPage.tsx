import { useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { AuthServiceError, authService } from './authService';
import { WebLoginCodePanel } from './WebLoginCodePanel';
import brandLogo from '../../../info/finanzas-pwa/assets/brand/logo.svg';

type AuthMode = 'sign-in' | 'sign-up' | 'recovery';

const modeTitles: Record<AuthMode, string> = {
  'sign-in': 'Iniciar sesión',
  'sign-up': 'Crear cuenta',
  recovery: 'Recuperar contraseña',
};

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [loginMethod, setLoginMethod] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'info' } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const title = modeTitles[mode];

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (mode === 'sign-up') {
        const result = await authService.signUp(email, password);
        setFeedback({
          message: result.requiresEmailConfirmation
            ? 'Revisa tu correo para confirmar la cuenta.'
            : 'Cuenta creada.',
          tone: 'info',
        });
      } else if (mode === 'sign-in') {
        await authService.signIn(email, password);
        setFeedback({ message: 'Sesión iniciada.', tone: 'info' });
      } else {
        await authService.requestPasswordRecovery(email);
        setFeedback({
          message:
            'Si el correo está registrado, recibirás instrucciones para recuperar el acceso.',
          tone: 'info',
        });
      }
    } catch (error) {
      setFeedback({
        message:
          error instanceof AuthServiceError
            ? error.message
            : 'No se pudo completar la solicitud. Inténtalo de nuevo.',
        tone: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" className="auth-panel">
        <p className="eyebrow">Finanzas personales</p>
        <div className="auth-brand">
          <img alt="" src={brandLogo} />
          <h1 id="auth-title">Mave</h1>
        </div>
        <p className="auth-intro">Tus movimientos, en un espacio privado.</p>

        <div aria-label="Acceso a Mave" className="auth-modes">
          <button
            aria-pressed={mode === 'sign-in'}
            onClick={() => changeMode('sign-in')}
            type="button"
          >
            Iniciar sesión
          </button>
          <button
            aria-pressed={mode === 'sign-up'}
            onClick={() => changeMode('sign-up')}
            type="button"
          >
            Crear cuenta
          </button>
          <button
            aria-pressed={mode === 'recovery'}
            onClick={() => changeMode('recovery')}
            type="button"
          >
            Recuperar contraseña
          </button>
        </div>

        {mode === 'sign-in' ? (
          <div aria-label="Método de acceso" className="auth-login-methods" role="group">
            <button
              aria-pressed={loginMethod === 'password'}
              onClick={() => setLoginMethod('password')}
              type="button"
            >
              Contraseña
            </button>
            <button
              aria-pressed={loginMethod === 'code'}
              onClick={() => setLoginMethod('code')}
              type="button"
            >
              Código de 6 dígitos
            </button>
          </div>
        ) : null}

        {mode === 'sign-in' && loginMethod === 'code' ? (
          <WebLoginCodePanel email={email} onEmailChange={setEmail} />
        ) : (
          <form aria-label={title} onSubmit={handleSubmit}>
            <h2>{title}</h2>
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              autoComplete="email"
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />

            {mode !== 'recovery' ? (
              <>
                <label htmlFor="auth-password">Contraseña</label>
                <input
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  id="auth-password"
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </>
            ) : null}

            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Procesando…' : title}
            </button>
          </form>
        )}

        {feedback ? (
          <FeedbackMessage tone={feedback.tone}>{feedback.message}</FeedbackMessage>
        ) : null}
      </section>
    </main>
  );
}
