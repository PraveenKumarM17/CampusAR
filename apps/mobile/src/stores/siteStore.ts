import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {Site} from '@campusar/shared';
import {resolveActiveSiteId} from '../lib/campus';

interface SiteState {
  activeSiteId: string | null;
  sites: Site[];
  setSites: (sites: Site[]) => void;
  setActiveSiteId: (id: string | null) => void;
}

export const useSiteStore = create<SiteState>()(
  persist(
    set => ({
      activeSiteId: null,
      sites: [],
      setSites: sites =>
        set(state => ({
          sites,
          activeSiteId: resolveActiveSiteId(sites, state.activeSiteId),
        })),
      setActiveSiteId: id => set({activeSiteId: id}),
    }),
    {
      name: 'campusar-site-mobile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({activeSiteId: s.activeSiteId}),
    },
  ),
);
