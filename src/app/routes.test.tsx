import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mockAuthState = vi.hoisted(() => ({
  errorCode: null,
  session: { user: { email: 'person@example.invalid', id: 'user-a' } } as {
    user: { email: string; id: string };
  } | null,
  status: 'authenticated' as string,
}));

const mockWebLogin = vi.hoisted(() => ({
  approve: vi.fn(),
  approveCode: vi.fn(),
  inspect: vi.fn(),
  listPendingCodeApprovals: vi.fn().mockResolvedValue([]),
  poll: vi.fn(),
  rejectCode: vi.fn(),
  registerPushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  start: vi.fn(),
  startCode: vi.fn(),
}));

vi.mock('./useAuthSession', () => ({
  useAuthSession: () => mockAuthState,
}));
vi.mock('../features/auth/webLoginService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/auth/webLoginService')>()),
  webLoginService: mockWebLogin,
}));

import { AppPinAccessProvider } from './AppPinAccessProvider';
import { AppRoutes } from './routes';
import { appPinService } from '../features/auth/appPinService';

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <AppPinAccessProvider>
        <AppRoutes />
      </AppPinAccessProvider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="current-location">
      {`${location.pathname}${location.search}${location.hash}`}
    </output>
  );
}

afterEach(() => {
  cleanup();
  mockWebLogin.listPendingCodeApprovals.mockResolvedValue([]);
  mockAuthState.status = 'authenticated';
  mockAuthState.session = { user: { email: 'person@example.invalid', id: 'user-a' } };
  appPinService.clearPin('user-a');
});

describe('authenticated app PIN gate', () => {
  it('hides account pages until the configured PIN is verified', async () => {
    const user = userEvent.setup();
    await appPinService.setPin('user-a', '482916');

    renderProfile();

    expect(screen.getByRole('heading', { name: 'Introduce tu PIN' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('PIN de seis dígitos'), '482916');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
  });

  it('clears the fragment challenge before requiring the local PIN to approve a PC login', async () => {
    await appPinService.setPin('user-a', '482916');

    render(
      <MemoryRouter
        initialEntries={[
          '/login/approve#request=c22e553d-87b3-44c4-9c0d-0137c8881111&approval=' + 'a'.repeat(64),
        ]}
      >
        <AppPinAccessProvider>
          <LocationProbe />
          <AppRoutes />
        </AppPinAccessProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Introduce tu PIN' })).toBeInTheDocument();
    expect(mockWebLogin.inspect).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent('/login/approve');
      expect(screen.getByTestId('current-location')).not.toHaveTextContent('approval=');
    });
  });

  it('opens the approval route when a valid manual code is submitted from Security settings', async () => {
    const user = userEvent.setup();
    mockWebLogin.inspect.mockResolvedValue({
      clientLabel: 'desktop.example.invalid',
      status: 'pending',
    });

    render(
      <MemoryRouter initialEntries={['/profile?section=security']}>
        <AppPinAccessProvider>
          <AppRoutes />
        </AppPinAccessProvider>
      </MemoryRouter>,
    );

    await user.type(
      screen.getByLabelText('Código manual'),
      'c22e553d-87b3-44c4-9c0d-0137c8881111:' + 'a'.repeat(64),
    );
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(
      await screen.findByRole('heading', { name: 'Autorizar inicio en PC' }),
    ).toBeInTheDocument();
    expect(mockWebLogin.inspect).toHaveBeenCalledWith(
      'c22e553d-87b3-44c4-9c0d-0137c8881111',
      'a'.repeat(64),
    );
  });

  it('shows the recommended setting only while signed in and can enable or disable it', async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole('link', { name: /Seguridad/ }));
    expect(screen.getByText('Recomendado')).toBeInTheDocument();

    const toggle = screen.getByRole('checkbox', { name: /Solicitar PIN al abrir Mave/ });
    await user.click(toggle);
    await user.type(screen.getByLabelText('PIN de seis dígitos'), '482916');
    await user.type(screen.getByLabelText('Repite el PIN'), '482916');
    await user.click(screen.getByRole('button', { name: 'Guardar PIN' }));

    expect(
      await screen.findByText('El PIN quedó activado en este dispositivo.'),
    ).toBeInTheDocument();
    expect(appPinService.isEnabled('user-a')).toBe(true);

    await user.click(toggle);
    expect(appPinService.isEnabled('user-a')).toBe(false);

    cleanup();
    mockAuthState.status = 'unauthenticated';
    mockAuthState.session = null;
    renderProfile();
    expect(screen.queryByRole('link', { name: /Seguridad/ })).not.toBeInTheDocument();
  });
});
