import { useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthSession } from './useAuthSession';
import { FeedbackMessage } from './components/FeedbackMessage';
import { getAppErrorMessage } from '../lib/errors';
import { AuthPage } from '../features/auth/AuthPage';
import { signOutWithPendingWarning } from '../features/auth/logoutService';
import { MovementList } from '../features/movements/MovementList';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { GoalsPage } from '../features/goals/GoalsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<SessionRoute />}>
        <Route path="/" element={<MovementList />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
      </Route>
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function SessionRoute() {
  const { errorCode, session, status } = useAuthSession();

  if (status === 'unauthenticated') {
    return <AuthPage />;
  }

  if (status === 'authenticated' && session) {
    return <AuthenticatedHome email={session.user.email ?? ''} ownerId={session.user.id} />;
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

function AuthenticatedHome({ email, ownerId }: { email: string; ownerId: string }) {
  const [error, setError] = useState(false);

  async function handleSignOut() {
    try {
      await signOutWithPendingWarning(ownerId);
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
      <nav aria-label="Navegación principal" className="session-navigation">
        <NavLink end to="/">
          Movimientos
        </NavLink>
        <NavLink to="/accounts">Cuentas y transferencias</NavLink>
        <NavLink to="/goals">Metas</NavLink>
      </nav>
      <Outlet />
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
