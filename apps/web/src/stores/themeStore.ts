import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccessibilityPrefs, IndoorTransitionStatus } from '@campusar/shared';
import { DEFAULT_ACCESSIBILITY } from '@campusar/shared';
import {
  afterIndoorCompletePatch,
  type BuildingNavPatch,
} from '../lib/buildingNavigation';

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

  selectedBuildingId: string | null;
  selectedBuildingName: string | null;
  hasIndoorMap: boolean;
  indoorMapId: string | null;
  outdoorEntranceNodeId: string | null;
  indoorDestinationPlaceId: string | null;
  indoorDestinationName: string | null;
  indoorDestinationDetail: string | null;
  arrivalPromptShown: boolean;
  indoorPickerDismissed: boolean;
  transitionStatus: IndoorTransitionStatus;

  applyBuildingContext: (patch: BuildingNavPatch) => void;
  clearBuildingContext: () => void;
  markArrivedAtBuilding: () => void;
  dismissIndoorPicker: () => void;
  setIndoorDestination: (placeId: string, name: string, detail: string | null) => void;
  changeIndoorDestination: () => void;
  startWaitingForAnchor: () => void;
  startIndoorNavigation: () => void;
  cancelIndoorScan: () => void;
  completeIndoorNavigation: () => void;
  resetForSiteChange: () => void;
}

const emptyBuilding = {
  selectedBuildingId: null as string | null,
  selectedBuildingName: null as string | null,
  hasIndoorMap: false,
  indoorMapId: null as string | null,
  outdoorEntranceNodeId: null as string | null,
  indoorDestinationPlaceId: null as string | null,
  indoorDestinationName: null as string | null,
  indoorDestinationDetail: null as string | null,
  arrivalPromptShown: false,
  indoorPickerDismissed: false,
  transitionStatus: 'none' as IndoorTransitionStatus,
};

export const useNavStore = create<NavState>()(
  persist(
    (set, get) => ({
      sourceNodeId: null,
      destinationNodeId: null,
      ...emptyBuilding,
      setSource: (sourceNodeId) => set({ sourceNodeId }),
      setDestination: (destinationNodeId) => {
        const s = get();
        if (destinationNodeId && destinationNodeId === s.outdoorEntranceNodeId) {
          set({ destinationNodeId });
          return;
        }
        set({ destinationNodeId, ...emptyBuilding });
      },
      applyBuildingContext: (patch) =>
        set({
          ...patch,
          destinationNodeId: patch.outdoorEntranceNodeId ?? get().destinationNodeId,
        }),
      clearBuildingContext: () => set(emptyBuilding),
      markArrivedAtBuilding: () =>
        set({
          arrivalPromptShown: true,
          indoorPickerDismissed: false,
          transitionStatus: 'arrived_at_building',
        }),
      dismissIndoorPicker: () =>
        set({
          indoorPickerDismissed: true,
          transitionStatus: 'none',
        }),
      setIndoorDestination: (placeId, name, detail) =>
        set({
          indoorDestinationPlaceId: placeId,
          indoorDestinationName: name,
          indoorDestinationDetail: detail,
          transitionStatus: 'waiting_for_anchor',
        }),
      changeIndoorDestination: () =>
        set({
          indoorDestinationPlaceId: null,
          indoorDestinationName: null,
          indoorDestinationDetail: null,
          transitionStatus: 'selecting_indoor_destination',
        }),
      startWaitingForAnchor: () => set({ transitionStatus: 'waiting_for_anchor' }),
      startIndoorNavigation: () => set({ transitionStatus: 'navigating_indoor' }),
      cancelIndoorScan: () => set({ transitionStatus: 'waiting_for_anchor' }),
      completeIndoorNavigation: () => set(afterIndoorCompletePatch()),
      resetForSiteChange: () => set({ sourceNodeId: null, destinationNodeId: null, ...emptyBuilding }),
    }),
    {
      name: 'campusar-nav',
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
      }),
      partialize: (s) => ({
        sourceNodeId: s.sourceNodeId,
        destinationNodeId: s.destinationNodeId,
        selectedBuildingId: s.selectedBuildingId,
        selectedBuildingName: s.selectedBuildingName,
        hasIndoorMap: s.hasIndoorMap,
        indoorMapId: s.indoorMapId,
        outdoorEntranceNodeId: s.outdoorEntranceNodeId,
        indoorDestinationPlaceId: s.indoorDestinationPlaceId,
        indoorDestinationName: s.indoorDestinationName,
        indoorDestinationDetail: s.indoorDestinationDetail,
        arrivalPromptShown: s.arrivalPromptShown,
        indoorPickerDismissed: s.indoorPickerDismissed,
        transitionStatus: s.transitionStatus,
      }),
    },
  ),
);
