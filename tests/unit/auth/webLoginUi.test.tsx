import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWebLogin = vi.hoisted(() => ({
  approve: vi.fn(),
  inspect: vi.fn(),
  poll: vi.fn(),
  start: vi.fn(),
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
    expect(screen.getByText(/Vence en/)).toBeInTheDocument();
    expect(mockWebLogin.start).toHaveBeenCalledOnce();
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
