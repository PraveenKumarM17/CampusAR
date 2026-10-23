import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@campusar/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** False until zustand persist has restored session from storage. */
  hydrated: boolean;
  setSession: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

function createAuthStore(persistName: string) {
  const useStore = create<AuthState>()(
    persist(
      (set) => ({
        user: null,
        accessToken: null,
        refreshToken: null,
        hydrated: false,
        setSession: (user, accessToken, refreshToken) =>
          set({ user, accessToken, refreshToken, hydrated: true }),
        logout: () => set({ user: null, accessToken: null, refreshToken: null, hydrated: true }),
      }),
      {
        name: persistName,
        onRehydrateStorage: () => () => {
          useStore.setState({ hydrated: true });
        },
      },
    ),
  );
  return useStore;
}

/** Visitor session. The admin build replaces the persist name at compile time. */
export const useAuthStore = createAuthStore(
  import.meta.env.VITE_AUTH_PERSIST_NAME || 'campusar-auth',
);
