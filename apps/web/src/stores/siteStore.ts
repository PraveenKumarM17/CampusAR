import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Site } from '@campusar/shared';
import { resolveActiveSiteId } from '../lib/campus';

interface SiteState {
  activeSiteId: string | null;
  sites: Site[];
  setSites: (sites: Site[]) => void;
  setActiveSiteId: (id: string | null) => void;
}

export const useSiteStore = create<SiteState>()(
  persist(
    (set) => ({
      activeSiteId: null,
      sites: [],
      setSites: (sites) =>
        set((state) => ({
          sites,
          activeSiteId: resolveActiveSiteId(sites, state.activeSiteId),
        })),
      setActiveSiteId: (id) => set({ activeSiteId: id }),
    }),
    { name: 'campusar-site', partialize: (s) => ({ activeSiteId: s.activeSiteId }) },
  ),
);

export function activeSite(state: SiteState): Site | null {
  return state.sites.find((s) => s.id === state.activeSiteId) ?? state.sites[0] ?? null;
}
