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
      dark: true,
      hydrate: () => {
        document.documentElement.classList.toggle('dark', get().dark);
      },
      toggle: () => {
        const dark = !get().dark;
        document.documentElement.classList.toggle('dark', dark);
        set({ dark });
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
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      accessibility: DEFAULT_ACCESSIBILITY,
      setAccessibility: (prefs) => set({ accessibility: { ...get().accessibility, ...prefs } }),
      voiceEnabled: true,
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
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
