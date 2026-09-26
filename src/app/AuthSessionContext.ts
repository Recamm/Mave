import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppErrorCode } from '../lib/errors';

export type AuthSessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

export type AuthSessionState = {
  errorCode: AppErrorCode | null;
  session: Session | null;
  status: AuthSessionStatus;
};

export const AuthSessionContext = createContext<AuthSessionState | null>(null);
