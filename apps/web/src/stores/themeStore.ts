import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccessibilityPrefs } from '@campusar/shared';
import { DEFAULT_ACCESSIBILITY } from '@campusar/shared';

interface ThemeState {
  dark: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      dark: false,
      hydrate: () => {
        // Light atlas theme is the product default; clear any legacy dark class.
        document.documentElement.classList.remove('dark');
        if (get().dark) set({ dark: false });
      },
      toggle: () => {
        // Theme toggle kept for API compatibility; product is light-first.
        set({ dark: false });
        document.documentElement.classList.remove('dark');
      },
    }),
    { name: 'campusar-theme' },
  ),
);

interface PrefsState {
  accessibility: AccessibilityPrefs;
  setAccessibility: (prefs: Partial<AccessibilityPrefs>) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  avatarGender: 'male' | 'female';
  setAvatarGender: (g: 'male' | 'female') => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      accessibility: DEFAULT_ACCESSIBILITY,
      setAccessibility: (prefs) => set({ accessibility: { ...get().accessibility, ...prefs } }),
      voiceEnabled: true,
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      avatarGender: 'female',
      setAvatarGender: (avatarGender) => set({ avatarGender }),
    }),
    { name: 'campusar-prefs' },
  ),
);

interface NavState {
  sourceNodeId: string | null;
  destinationNodeId: string | null;
  setSource: (id: string | null) => void;
  setDestination: (id: string | null) => void;
}

export const useNavStore = create<NavState>((set) => ({
  sourceNodeId: 'a1000001-0000-0000-0000-000000000001',
  destinationNodeId: null,
  setSource: (sourceNodeId) => set({ sourceNodeId }),
  setDestination: (destinationNodeId) => set({ destinationNodeId }),
}));
