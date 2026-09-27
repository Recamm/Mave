import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

type AppPinAccessState = {
  unlockedUserId: string | null;
  setUnlockedUserId: Dispatch<SetStateAction<string | null>>;
};

export const AppPinAccessContext = createContext<AppPinAccessState | null>(null);

export function useAppPinAccess(): AppPinAccessState {
  const state = useContext(AppPinAccessContext);
  if (!state) {
    throw new Error('useAppPinAccess must be used within AppPinAccessProvider.');
  }

  return state;
}
