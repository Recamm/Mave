import { BrowserRouter } from 'react-router-dom';
import { AuthSessionProvider } from './AuthSessionProvider';
import { AppRoutes } from './routes';

export function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthSessionProvider>
  );
}
