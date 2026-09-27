import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mockAuthState = vi.hoisted(() => ({
  errorCode: null,
  session: { user: { email: 'person@example.invalid', id: 'user-a' } } as {
    user: { email: string; id: string };
  } | null,
  status: 'authenticated' as string,
}));

const mockWebLogin = vi.hoisted(() => ({
  approveCode: vi.fn(),
  listPendingCodeApprovals: vi.fn().mockResolvedValue([]),
  poll: vi.fn(),
  rejectCode: vi.fn(),
  registerPushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
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

  it('shows the recommended setting only while signed in and can enable or disable it', async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole('link', { name: /Seguridad/ }));
    expect(screen.queryByRole('heading', { name: 'Acceso desde PC' })).not.toBeInTheDocument();
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
