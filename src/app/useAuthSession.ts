import { useContext } from 'react';
import { AuthSessionContext, type AuthSessionState } from './AuthSessionContext';

export function useAuthSession(): AuthSessionState {
  const state = useContext(AuthSessionContext);

  if (!state) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return state;
}
