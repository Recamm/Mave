import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { AuthSessionContext, type AuthSessionState } from './AuthSessionContext';

const initialState: AuthSessionState = {
  errorCode: null,
  session: null,
  status: 'loading',
};

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setState({
        errorCode: 'supabase-configuration',
        session: null,
        status: 'unavailable',
      });
      return;
    }

    let isActive = true;
    let receivedAuthEvent = false;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      if (isActive) {
        setState(stateFromSession(session));
      }
    });

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isActive || receivedAuthEvent) {
          return;
        }

        setState(
          error
            ? {
                errorCode: 'session-unavailable',
                session: null,
                status: 'unavailable',
              }
            : stateFromSession(data.session),
        );
      })
      .catch(() => {
        if (isActive && !receivedAuthEvent) {
          setState({
            errorCode: 'session-unavailable',
            session: null,
            status: 'unavailable',
          });
        }
      });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthSessionContext.Provider value={state}>{children}</AuthSessionContext.Provider>;
}

function stateFromSession(session: Session | null): AuthSessionState {
  return {
    errorCode: null,
    session,
    status: session ? 'authenticated' : 'unauthenticated',
  };
}
