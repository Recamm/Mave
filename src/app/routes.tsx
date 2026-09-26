import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useAuthSession } from './useAuthSession';
import { FeedbackMessage } from './components/FeedbackMessage';
import { getAppErrorMessage } from '../lib/errors';
import { AuthPage } from '../features/auth/AuthPage';
import { authService } from '../features/auth/authService';
import { MovementList } from '../features/movements/MovementList';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const { errorCode, session, status } = useAuthSession();

  if (status === 'unauthenticated') {
    return <AuthPage />;
  }

  if (status === 'authenticated' && session) {
    return <AuthenticatedHome email={session.user.email ?? ''} />;
  }

  return (
    <main>
      <h1>Mave</h1>
      {status === 'loading' ? (
        <FeedbackMessage tone="info">Comprobando la sesión.</FeedbackMessage>
      ) : (
        <FeedbackMessage tone="error">
          {getAppErrorMessage(errorCode ?? 'session-unavailable')}
        </FeedbackMessage>
      )}
    </main>
  );
}

function AuthenticatedHome({ email }: { email: string }) {
  const [error, setError] = useState(false);

  async function handleSignOut() {
    try {
      await authService.signOut();
    } catch {
      setError(true);
    }
  }

  return (
    <div className="authenticated-home">
      <header className="session-strip">
        {email ? <p>Sesión de {email}</p> : <p>Sesión activa</p>}
        <button onClick={() => void handleSignOut()} type="button">
          Cerrar sesión
        </button>
      </header>
      {error ? (
        <FeedbackMessage tone="error">
          No se pudo cerrar la sesión. Inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}
      <MovementList />
    </div>
  );
}

function NotFoundRoute() {
  return (
    <main>
      <h1>Página no encontrada</h1>
      <p>La dirección solicitada no existe.</p>
      <Link to="/">Volver a Mave</Link>
    </main>
  );
}
