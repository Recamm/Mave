import { Link, Route, Routes } from 'react-router-dom';
import { useAuthSession } from './useAuthSession';
import { FeedbackMessage } from './components/FeedbackMessage';
import { getAppErrorMessage } from '../lib/errors';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const { errorCode, status } = useAuthSession();

  return (
    <main>
      <h1>Mave</h1>
      <SessionFeedback errorCode={errorCode} status={status} />
    </main>
  );
}

function SessionFeedback({
  errorCode,
  status,
}: {
  errorCode: ReturnType<typeof useAuthSession>['errorCode'];
  status: ReturnType<typeof useAuthSession>['status'];
}) {
  if (status === 'loading') {
    return <FeedbackMessage tone="info">Comprobando la sesión.</FeedbackMessage>;
  }

  if (status === 'unavailable') {
    return (
      <FeedbackMessage tone="error">
        {getAppErrorMessage(errorCode ?? 'session-unavailable')}
      </FeedbackMessage>
    );
  }

  if (status === 'unauthenticated') {
    return <FeedbackMessage tone="info">Inicia sesión para continuar.</FeedbackMessage>;
  }

  return <FeedbackMessage tone="info">Sesión iniciada.</FeedbackMessage>;
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
