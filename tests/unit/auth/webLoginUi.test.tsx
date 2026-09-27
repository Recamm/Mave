import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWebLogin = vi.hoisted(() => ({
  approve: vi.fn(),
  approveCode: vi.fn(),
  inspect: vi.fn(),
  listPendingCodeApprovals: vi.fn(),
  poll: vi.fn(),
  rejectCode: vi.fn(),
  registerPushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  start: vi.fn(),
  startCode: vi.fn(),
}));

vi.mock('../../../src/features/auth/webLoginService', () => ({
  webLoginService: mockWebLogin,
}));

import { AuthPage } from '../../../src/features/auth/AuthPage';
import { WebLoginApprovalPage } from '../../../src/features/auth/WebLoginApprovalPage';

beforeEach(() => {
  mockWebLogin.start.mockResolvedValue({
    approvalSecret: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 180_000).toISOString(),
    pollSecret: 'b'.repeat(64),
    requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
  });
  mockWebLogin.startCode.mockResolvedValue({
    code: '004218',
    expiresAt: new Date(Date.now() + 180_000).toISOString(),
    pollSecret: 'b'.repeat(64),
    requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
  });
  mockWebLogin.poll.mockResolvedValue('pending');
  mockWebLogin.inspect.mockResolvedValue({
    clientLabel: 'desktop.example.invalid',
    status: 'pending',
  });
  mockWebLogin.approve.mockResolvedValue('approved');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QR login screens', () => {
  it('shows a time-limited QR option on the desktop sign-in page', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole('button', { name: 'Código QR' }));

    expect(await screen.findByTitle('Código QR para iniciar sesión en Mave')).toBeInTheDocument();
    expect(
      screen.getByText(`c22e553d-87b3-44c4-9c0d-0137c8881111:${'a'.repeat(64)}`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar código manual' })).toBeInTheDocument();
    expect(screen.getByText(/Vence en/)).toBeInTheDocument();
    expect(mockWebLogin.start).toHaveBeenCalledOnce();
  });

  it('starts email code login and polls for the one-time PC handoff', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole('button', { name: 'Código de 6 dígitos' }));
    await user.type(screen.getByLabelText('Correo electrónico'), 'person@example.invalid');
    await user.click(screen.getByRole('button', { name: 'Mostrar código' }));

    expect(await screen.findByLabelText('Código de seis dígitos')).toHaveTextContent('004218');
    expect(mockWebLogin.startCode).toHaveBeenCalledWith('person@example.invalid');
    await waitFor(() => {
      expect(mockWebLogin.poll).toHaveBeenCalledWith(
        'c22e553d-87b3-44c4-9c0d-0137c8881111',
        'b'.repeat(64),
      );
    });
  });

  it('can switch back to password login from the code panel', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    await user.click(screen.getByRole('button', { name: 'Código de 6 dígitos' }));
    const emailInput = screen.getByLabelText('Correo electrónico');
    await user.type(emailInput, 'person@example.invalid');
    await user.click(screen.getByRole('button', { name: 'Contraseña' }));

    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('person@example.invalid');
    expect(screen.queryByRole('button', { name: 'Mostrar código' })).not.toBeInTheDocument();
  });

  it('opens a mobile popup and approves the six-digit PC login', async () => {
    const user = userEvent.setup();
    mockWebLogin.listPendingCodeApprovals.mockResolvedValue([
      {
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 180_000).toISOString(),
        originHost: 'desktop.example.invalid',
        requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
      },
    ]);
    mockWebLogin.approveCode.mockResolvedValue({ status: 'approved' });
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    const { WebLoginCodeApprovalInbox } =
      await import('../../../src/features/auth/WebLoginCodeApprovalInbox');
    render(<WebLoginCodeApprovalInbox />);

    expect(
      await screen.findByRole('dialog', { name: 'Autorizar inicio en PC' }),
    ).toBeInTheDocument();
    expect(screen.getByText('desktop.example.invalid')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '004218');
    await user.click(screen.getByRole('button', { name: 'Autorizar acceso' }));

    expect(await screen.findByText(/Acceso autorizado/)).toBeInTheDocument();
    expect(mockWebLogin.approveCode).toHaveBeenCalledWith(
      'c22e553d-87b3-44c4-9c0d-0137c8881111',
      '004218',
    );
  });

  it('shows the requesting host and account before approving a login', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WebLoginApprovalPage
          accountEmail="person@example.invalid"
          approvalSecret={'a'.repeat(64)}
          requestId="c22e553d-87b3-44c4-9c0d-0137c8881111"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('desktop.example.invalid')).toBeInTheDocument();
    expect(screen.getByText('person@example.invalid')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Autorizar inicio de sesión' }));

    expect(await screen.findByText(/Acceso autorizado/)).toBeInTheDocument();
    expect(mockWebLogin.approve).toHaveBeenCalledWith(
      'c22e553d-87b3-44c4-9c0d-0137c8881111',
      'a'.repeat(64),
    );
  });
});
