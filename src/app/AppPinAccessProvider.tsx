import { useEffect, useState, type ReactNode } from 'react';
import { AppPinAccessContext } from './AppPinAccessContext';
import { useAuthSession } from './useAuthSession';

export function AppPinAccessProvider({ children }: { children: ReactNode }) {
  const { session, status } = useAuthSession();
  const [unlockedUserId, setUnlockedUserId] = useState<string | null>(null);
  const currentUserId = status === 'authenticated' ? (session?.user.id ?? null) : null;

  useEffect(() => {
    setUnlockedUserId((previousUserId) =>
      previousUserId === currentUserId ? previousUserId : null,
    );
  }, [currentUserId]);

  useEffect(() => {
    function lockWhenHidden() {
      if (document.visibilityState === 'hidden') {
        setUnlockedUserId(null);
      }
    }

    document.addEventListener('visibilitychange', lockWhenHidden);
    return () => document.removeEventListener('visibilitychange', lockWhenHidden);
  }, []);

  return (
    <AppPinAccessContext.Provider value={{ unlockedUserId, setUnlockedUserId }}>
      {children}
    </AppPinAccessContext.Provider>
  );
}
