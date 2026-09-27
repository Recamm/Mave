import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthService } from '../../../src/features/auth/authService';
import type { Database } from '../../../src/lib/supabase/database.types';

function createMockClient() {
  const auth = {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  };

  return {
    auth,
    client: { auth } as unknown as SupabaseClient<Database>,
  };
}

describe('auth service', () => {
  it('rejects account creation while offline before accessing Supabase', async () => {
    const getClient = vi.fn(() => null);
    const service = createAuthService(getClient, () => false);

    await expect(service.signUp('person@example.invalid', 'test-password')).rejects.toMatchObject({
      code: 'offline',
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('reports when email confirmation is required', async () => {
    const { auth, client } = createMockClient();
    auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null });
    const service = createAuthService(
      () => client,
      () => true,
    );

    await expect(service.signUp('person@example.invalid', 'test-password')).resolves.toEqual({
      requiresEmailConfirmation: true,
    });
  });

  it('normalizes the email for signup and sends a recovery redirect', async () => {
    const { auth, client } = createMockClient();
    auth.signUp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const service = createAuthService(
      () => client,
      () => true,
    );

    await service.signUp(' person@example.invalid ', 'test-password');
    await service.requestPasswordRecovery('person@example.invalid');

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'person@example.invalid',
      password: 'test-password',
    });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.invalid', {
      redirectTo: window.location.origin,
    });
  });

  it('updates email and password through Supabase Auth', async () => {
    const { auth, client } = createMockClient();
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const service = createAuthService(
      () => client,
      () => true,
    );

    await service.updateEmail(' new@example.invalid ');
    await service.updatePassword('new-password');

    expect(auth.updateUser).toHaveBeenNthCalledWith(
      1,
      { email: 'new@example.invalid' },
      { emailRedirectTo: window.location.origin },
    );
    expect(auth.updateUser).toHaveBeenNthCalledWith(2, { password: 'new-password' });
  });

  it('rejects credential updates while offline before accessing Supabase', async () => {
    const getClient = vi.fn(() => null);
    const service = createAuthService(getClient, () => false);

    await expect(service.updateEmail('person@example.invalid')).rejects.toMatchObject({
      code: 'offline',
    });
    await expect(service.updatePassword('new-password')).rejects.toMatchObject({
      code: 'offline',
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('delegates sign-in and sign-out to Supabase Auth', async () => {
    const { auth, client } = createMockClient();
    auth.signInWithPassword.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    const service = createAuthService(
      () => client,
      () => true,
    );

    await service.signIn('person@example.invalid', 'test-password');
    await service.signOut();

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.invalid',
      password: 'test-password',
    });
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
