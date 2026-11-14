import { create } from "zustand";
import { DATE_MAX, DATE_MIN, getSites } from "../api";
import type { ChatLevel, ChatMessage, Site, View } from "../api";

interface NavigationSnapshot {
  selectedSiteId: string | null;
  selectedDate: string;
  view: View;
  compareIds: string[];
}

interface StoreState extends NavigationSnapshot {
  level: ChatLevel;
  sites: Site[];
  messages: ChatMessage[];
  sitesLoading: boolean;
  sitesError: string | null;
  chatLoading: boolean;
  chatError: string | null;
  freeFlight: boolean;
  chatOpen: boolean;
  educationalMode: boolean;
  undoHistory: NavigationSnapshot[];
  setSites: (sites: Site[]) => void;
  setSitesLoading: (loading: boolean) => void;
  setSitesError: (error: string | null) => void;
  selectSite: (siteId: string | null) => void;
  setSelectedDate: (date: string) => void;
  setView: (view: View) => void;
  setCompareIds: (ids: string[]) => void;
  setLevel: (level: ChatLevel) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setChatLoading: (loading: boolean) => void;
  setChatError: (error: string | null) => void;
  setFreeFlight: (enabled: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setEducationalMode: (enabled: boolean) => void;
  undo: () => void;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function clampDate(value: string): string {
  const min = validDate(DATE_MIN) ? DATE_MIN : "2026-01-01";
  const max = validDate(DATE_MAX) && DATE_MAX >= min ? DATE_MAX : "2030-12-31";
  const date = validDate(value) ? value : todayIso();
  return date < min ? min : date > max ? max : date;
}

function snapshot(state: NavigationSnapshot): NavigationSnapshot {
  return { ...state, compareIds: [...state.compareIds] };
}

function updateNavigation(
  state: StoreState,
  update: Partial<NavigationSnapshot>,
): Pick<StoreState, keyof NavigationSnapshot | "undoHistory"> {
  const next = { ...state, ...update };
  const unchanged =
    next.selectedSiteId === state.selectedSiteId &&
    next.selectedDate === state.selectedDate &&
    next.view === state.view &&
    next.compareIds.length === state.compareIds.length &&
    next.compareIds.every((id, index) => id === state.compareIds[index]);
  if (unchanged) return state;
  return {
    selectedSiteId: next.selectedSiteId,
    selectedDate: next.selectedDate,
    view: next.view,
    compareIds: [...next.compareIds],
    undoHistory: [...state.undoHistory, snapshot(state)].slice(-30),
  };
}

export const useStore = create<StoreState>((set) => ({
  selectedSiteId: null,
  selectedDate: clampDate(todayIso()),
  view: "globe",
  compareIds: [],
  level: "expert",
  sites: getSites(),
  messages: [],
  sitesLoading: false,
  sitesError: null,
  chatLoading: false,
  chatError: null,
  freeFlight: false,
  chatOpen: true,
  educationalMode: true,
  undoHistory: [],
  setSites: (sites) => set({ sites, sitesError: null, sitesLoading: false }),
  setSitesLoading: (sitesLoading) => set({ sitesLoading }),
  setSitesError: (sitesError) => set({ sitesError, sitesLoading: false }),
  selectSite: (siteId) => set((state) => updateNavigation(state, { selectedSiteId: siteId })),
  setSelectedDate: (date) => set((state) =>
    updateNavigation(state, { selectedDate: clampDate(date) }),
  ),
  setView: (view) => set((state) => updateNavigation(state, { view })),
  setCompareIds: (ids) => set((state) =>
    updateNavigation(state, { compareIds: [...new Set(ids)].slice(0, 3) }),
  ),
  setLevel: (level) => set({ level }),
  setMessages: (messages) => set({ messages }),
  setChatLoading: (chatLoading) => set({ chatLoading }),
  setChatError: (chatError) => set({ chatError }),
  setFreeFlight: (freeFlight) => set({ freeFlight }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setEducationalMode: (educationalMode) => set({ educationalMode }),
  undo: () => set((state) => {
    const previous = state.undoHistory[state.undoHistory.length - 1];
    if (!previous) return state;
    return { ...previous, undoHistory: state.undoHistory.slice(0, -1) };
  }),
}));
