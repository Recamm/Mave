import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthSession } from './useAuthSession';
import { FeedbackMessage } from './components/FeedbackMessage';
import { getAppErrorMessage } from '../lib/errors';
import { AuthPage } from '../features/auth/AuthPage';
import { MovementList } from '../features/movements/MovementList';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { GoalsPage } from '../features/goals/GoalsPage';
import { AccountSettingsPage } from '../features/account-settings/AccountSettingsPage';
import brandLogo from '../../info/finanzas-pwa/assets/brand/logo.svg';
import { House, Landmark, Target, UserRound } from 'lucide-react';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<SessionRoute />}>
        <Route path="/" element={<MovementList />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/profile" element={<AccountSettingsPage />} />
        <Route path="/settings" element={<Navigate replace to="/profile" />} />
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
    return <AuthenticatedHome />;
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

function AuthenticatedHome() {
  const { pathname } = useLocation();

  return (
    <div className="authenticated-home">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <header className={pathname === '/' ? 'session-strip session-strip--home' : 'session-strip'}>
        <Link aria-label="Mave, inicio" className="session-brand" to="/">
          <img alt="" src={brandLogo} />
          <span>Mave</span>
        </Link>
        <nav aria-label="Navegación principal" className="session-navigation">
          <NavLink end to="/">
            Inicio
          </NavLink>
          <NavLink to="/accounts">Cuentas</NavLink>
          <NavLink to="/goals">Metas</NavLink>
          <NavLink to="/profile">Perfil</NavLink>
        </nav>
      </header>
      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <nav aria-label="Navegación móvil" className="mobile-navigation">
        <NavLink end to="/">
          <House aria-hidden="true" size={20} />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/accounts">
          <Landmark aria-hidden="true" size={20} />
          <span>Cuentas</span>
        </NavLink>
        <NavLink to="/goals">
          <Target aria-hidden="true" size={20} />
          <span>Metas</span>
        </NavLink>
        <NavLink to="/profile">
          <UserRound aria-hidden="true" size={20} />
          <span>Perfil</span>
        </NavLink>
      </nav>
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
