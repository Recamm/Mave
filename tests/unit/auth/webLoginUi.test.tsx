import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWebLogin = vi.hoisted(() => ({
  approveCode: vi.fn(),
  listPendingCodeApprovals: vi.fn(),
  poll: vi.fn(),
  rejectCode: vi.fn(),
  registerPushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  startCode: vi.fn(),
}));

vi.mock('../../../src/features/auth/webLoginService', () => ({
  webLoginService: mockWebLogin,
}));

import { AuthPage } from '../../../src/features/auth/AuthPage';

beforeEach(() => {
  mockWebLogin.startCode.mockResolvedValue({
    code: '004218',
    expiresAt: new Date(Date.now() + 180_000).toISOString(),
    pollSecret: 'b'.repeat(64),
    requestId: 'c22e553d-87b3-44c4-9c0d-0137c8881111',
  });
  mockWebLogin.poll.mockResolvedValue('pending');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('login screens', () => {
  it('offers password and six-digit code login without a QR option', () => {
    render(<AuthPage />);

    expect(screen.getByRole('button', { name: /^Contraseña$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Código de 6 dígitos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Código QR' })).not.toBeInTheDocument();
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
});
