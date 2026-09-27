import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthSession } from './useAuthSession';
import { FeedbackMessage } from './components/FeedbackMessage';
import { LoadingIndicator } from './components/LoadingIndicator';
import { getAppErrorMessage } from '../lib/errors';
import { AuthPage } from '../features/auth/AuthPage';
import { AppPinLockScreen } from '../features/auth/AppPinLockScreen';
import { appPinService } from '../features/auth/appPinService';
import { WebLoginApprovalPage } from '../features/auth/WebLoginApprovalPage';
import { MovementList } from '../features/movements/MovementList';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { AccountSettingsPage } from '../features/account-settings/AccountSettingsPage';
import { StatisticsPage } from '../features/summaries/StatisticsPage';
import { useAppPinAccess } from './AppPinAccessContext';
import brandLogo from '../../info/finanzas-pwa/assets/brand/logo.svg';
import { Activity, House, Landmark, Settings } from 'lucide-react';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login/approve" element={<LoginApprovalRoute />} />
      <Route element={<SessionRoute />}>
        <Route path="/" element={<MovementList />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="/goals" element={<Navigate replace to="/accounts#savings-goals" />} />
        <Route path="/profile" element={<AccountSettingsPage />} />
        <Route path="/settings" element={<Navigate replace to="/profile" />} />
      </Route>
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function LoginApprovalRoute() {
  const { errorCode, session, status } = useAuthSession();
  const { setUnlockedUserId, unlockedUserId } = useAppPinAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [challenge] = useState(() => {
    const fragmentParams = new URLSearchParams(location.hash.slice(1));
    return {
      approvalSecret: fragmentParams.get('approval') ?? '',
      requestId: fragmentParams.get('request') ?? '',
    };
  });

  useEffect(() => {
    if (location.hash) {
      navigate(
        { pathname: location.pathname, search: location.search, hash: '' },
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  if (!challenge.requestId || !challenge.approvalSecret) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Aprobación de acceso</p>
          <h1>Solicitud no válida</h1>
          <p>Vuelve al PC e inicia una solicitud nueva.</p>
        </section>
      </main>
    );
  }

  if (status === 'loading') {
    return <SessionLoading isHome={false} />;
  }

  if (status === 'unauthenticated') {
    return <AuthPage showQrLogin={false} />;
  }

  if (status === 'authenticated' && session) {
    if (appPinService.isEnabled(session.user.id) && unlockedUserId !== session.user.id) {
      return (
        <AppPinLockScreen
          email={session.user.email}
          onUnlock={() => setUnlockedUserId(session.user.id)}
          userId={session.user.id}
        />
      );
    }

    return (
      <WebLoginApprovalPage
        accountEmail={session.user.email ?? ''}
        approvalSecret={challenge.approvalSecret}
        requestId={challenge.requestId}
      />
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Mave</h1>
        <FeedbackMessage tone="error">
          {getAppErrorMessage(errorCode ?? 'session-unavailable')}
        </FeedbackMessage>
      </section>
    </main>
  );
}

function SessionRoute() {
  const { errorCode, session, status } = useAuthSession();
  const { setUnlockedUserId, unlockedUserId } = useAppPinAccess();
  const { pathname } = useLocation();

  if (status === 'loading') {
    return <SessionLoading isHome={pathname === '/'} />;
  }

  if (status === 'unauthenticated') {
    return <AuthPage />;
  }

  if (status === 'authenticated' && session) {
    if (appPinService.isEnabled(session.user.id) && unlockedUserId !== session.user.id) {
      return (
        <AppPinLockScreen
          email={session.user.email}
          onUnlock={() => setUnlockedUserId(session.user.id)}
          userId={session.user.id}
        />
      );
    }

    return <AuthenticatedHome />;
  }

  return (
    <main>
      <h1>Mave</h1>
      <FeedbackMessage tone="error">
        {getAppErrorMessage(errorCode ?? 'session-unavailable')}
      </FeedbackMessage>
    </main>
  );
}

function SessionLoading({ isHome }: { isHome: boolean }) {
  return (
    <div aria-busy="true" className="authenticated-home session-loading">
      <header className={isHome ? 'session-strip session-strip--home' : 'session-strip'}>
        <SessionBrand />
      </header>
      <main className="session-loading__indicator">
        <LoadingIndicator label="Comprobando la sesión" />
      </main>
    </div>
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
        <SessionBrand />
        <nav aria-label="Navegación principal" className="session-navigation">
          <NavLink end to="/">
            Inicio
          </NavLink>
          <NavLink to="/accounts">Gestión</NavLink>
          <NavLink to="/statistics">Estadísticas</NavLink>
          <NavLink to="/profile">Configuración</NavLink>
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
          <span>Gestión</span>
        </NavLink>
        <NavLink to="/statistics">
          <Activity aria-hidden="true" size={20} />
          <span>Estadísticas</span>
        </NavLink>
        <NavLink to="/profile">
          <Settings aria-hidden="true" size={20} />
          <span>Ajustes</span>
        </NavLink>
      </nav>
    </div>
  );
}

function SessionBrand() {
  return (
    <Link aria-label="Mave, inicio" className="session-brand" to="/">
      <img alt="" src={brandLogo} />
      <span>Mave</span>
    </Link>
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
