import { BrowserRouter } from 'react-router-dom';
import { AppPinAccessProvider } from './AppPinAccessProvider';
import { AuthSessionProvider } from './AuthSessionProvider';
import { AppRoutes } from './routes';

export function App() {
  return (
    <AuthSessionProvider>
      <AppPinAccessProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppPinAccessProvider>
    </AuthSessionProvider>
  );
}
