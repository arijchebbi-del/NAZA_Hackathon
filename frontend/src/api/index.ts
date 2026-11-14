import { API_BASE_URL, USE_MOCK } from "./config";

export { API_BASE_URL, DATE_MAX, DATE_MIN, USE_MOCK } from "./config";

export type ChatLevel = "expert" | "decouverte";
export type ChatRole = "user" | "assistant";
export type View = "globe" | "site" | "heatmap";

export interface Site {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  score: number | null;
}

export interface SiteParameters {
  sun_visible_pct: number;
  longest_night_h: number;
  earth_visible_pct: number;
  longest_comm_gap_h: number;
}

export interface SiteDetail extends Site {
  source: string;
  parameters: SiteParameters;
}

export interface Sky {
  sun: { az: number; el: number };
  earth: { az: number; el: number };
  sunVisible: boolean;
  earthVisible: boolean;
  timeToSunsetH: number;
  timeToEarthsetH: number;
}

export interface TimelinePoint {
  t: string;
  sunEl: number;
  earthEl: number;
  sunVisible: boolean;
  earthVisible: boolean;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatAction {
  type: string;
  args: unknown;
}

export interface ChatResponse {
  text: string;
  actions: ChatAction[];
  rejected: { tool: string; error: string; suggestions: string[] }[];
}

export interface ChatAppState {
  selected_site: string | null;
  selected_date: string;
  view: View;
}

type SiteRecord = Omit<Site, "score"> & { parameters: SiteParameters };

function calculateScore(parameters: SiteParameters): number {
  const nightContinuity = Math.max(0, 100 - parameters.longest_night_h / 3);
  const communicationContinuity = Math.max(0, 100 - parameters.longest_comm_gap_h / 2.5);
  return Math.round(
    parameters.sun_visible_pct * 0.35 +
    parameters.earth_visible_pct * 0.3 +
    nightContinuity * 0.2 +
    communicationContinuity * 0.15,
  );
}

const records: (Site & { parameters: SiteParameters })[] = ([
  { id: "shackleton-rim", name: "Shackleton Rim", type: "Crater rim", lat: -89.9, lon: 0.0, parameters: { sun_visible_pct: 78, longest_night_h: 92, earth_visible_pct: 84, longest_comm_gap_h: 38 } },
  { id: "connecting-ridge", name: "Connecting Ridge", type: "Elevated ridge", lat: -89.6, lon: 41.2, parameters: { sun_visible_pct: 73, longest_night_h: 108, earth_visible_pct: 78, longest_comm_gap_h: 54 } },
  { id: "malapert-massif", name: "Malapert Massif", type: "Massif", lat: -85.9, lon: 0.0, parameters: { sun_visible_pct: 69, longest_night_h: 126, earth_visible_pct: 88, longest_comm_gap_h: 31 } },
  { id: "de-gerlache", name: "de Gerlache Rim", type: "Crater rim", lat: -88.3, lon: 290.2, parameters: { sun_visible_pct: 67, longest_night_h: 139, earth_visible_pct: 76, longest_comm_gap_h: 58 } },
  { id: "nobile", name: "Nobile", type: "Crater rim", lat: -84.7, lon: 53.1, parameters: { sun_visible_pct: 62, longest_night_h: 151, earth_visible_pct: 81, longest_comm_gap_h: 46 } },
  { id: "haworth", name: "Haworth", type: "Crater rim", lat: -87.4, lon: 315.6, parameters: { sun_visible_pct: 58, longest_night_h: 174, earth_visible_pct: 71, longest_comm_gap_h: 72 } },
  { id: "faustini", name: "Faustini Rim", type: "Crater rim", lat: -87.3, lon: 77.2, parameters: { sun_visible_pct: 53, longest_night_h: 196, earth_visible_pct: 66, longest_comm_gap_h: 88 } },
  { id: "cabeus", name: "Cabeus", type: "Crater floor", lat: -85.4, lon: 311.4, parameters: { sun_visible_pct: 44, longest_night_h: 228, earth_visible_pct: 62, longest_comm_gap_h: 104 } },
] satisfies SiteRecord[]).map((site) => ({ ...site, score: calculateScore(site.parameters) }));

const DAY_MS = 86_400_000;

function requireMock(): void {
  if (!USE_MOCK) {
    // TODO: Replace this mock-only guard with typed fetch calls to API_BASE_URL.
    throw new Error(`Live API requests are not configured yet${API_BASE_URL ? ` for ${API_BASE_URL}` : ""}.`);
  }
}

function seed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function dateOffset(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / DAY_MS);
}

function recordFor(id: string) {
  const site = records.find((item) => item.id === id);
  if (!site) throw new Error(`Unknown lunar site: ${id}`);
  return site;
}

export function getSites(onlyScored = false): Site[] {
  requireMock();
  return records.filter((site) => !onlyScored || site.score !== null).map(({ parameters: _parameters, ...site }) => ({ ...site }));
}

export function getSite(name: string): SiteDetail {
  requireMock();
  const needle = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const site = records.find((item) => item.id === name || item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === needle);
  if (!site) throw new Error(`Unknown lunar site: ${name}`);
  const { parameters, ...base } = site;
  return { ...base, source: "Local south-pole mock model · deterministic score formula", parameters: { ...parameters } };
}

export function getSky(siteId: string, date: string): Sky {
  requireMock();
  const site = recordFor(siteId);
  const day = dateOffset(date);
  const siteSeed = seed(site.id);
  const phase = ((day + siteSeed * 29.5) / 29.5) * Math.PI * 2;
  const sunAz = (site.lon + day * 12.2 + siteSeed * 120 + 360) % 360;
  const sunEl = Math.max(0.08, Math.min(3.2, 1.55 + 1.28 * Math.sin(phase) + (siteSeed - 0.5) * 0.22));
  const earthAz = (180 + site.lon + Math.sin(day / 42 + siteSeed * 4) * 7 + 360) % 360;
  const earthEl = Math.max(-3.5, Math.min(12.5, 5.2 + Math.sin(day / 36 + siteSeed * 6) * 5.7));
  const profile = getHorizonProfile(siteId);
  const sunHorizon = profile[Math.round(sunAz) % 360].el;
  const earthHorizon = profile[Math.round(earthAz) % 360].el;
  return {
    sun: { az: sunAz, el: sunEl },
    earth: { az: earthAz, el: earthEl },
    sunVisible: sunEl > sunHorizon,
    earthVisible: earthEl > earthHorizon,
    timeToSunsetH: Math.max(0, (sunEl - sunHorizon + 0.6) * 9.5),
    timeToEarthsetH: Math.max(0, (earthEl - earthHorizon + 0.6) * 7.8),
  };
}

export function getHorizonProfile(siteId: string): { az: number; el: number }[] {
  requireMock();
  const offset = seed(siteId) * 6.28;
  return Array.from({ length: 360 }, (_, az) => ({
    az,
    el: -0.8 + Math.sin(az * 0.055 + offset) * 0.72 + Math.sin(az * 0.117 + offset * 1.7) * 0.34 + Math.sin(az * 0.023 + offset * 0.4) * 0.24,
  }));
}

export function getTimeline(siteId: string, start: string, end: string): TimelinePoint[] {
  requireMock();
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  const days = Math.max(1, Math.min(365, Math.round((to - from) / DAY_MS)));
  return Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(from + (days === 0 ? 0 : (to - from) * index / days)).toISOString().slice(0, 10);
    const sky = getSky(siteId, date);
    return { t: date, sunEl: sky.sun.el, earthEl: sky.earth.el, sunVisible: sky.sunVisible, earthVisible: sky.earthVisible };
  });
}

export async function chat(
  message: string,
  history: ChatMessage[],
  level: ChatLevel,
  appState: ChatAppState,
): Promise<ChatResponse> {
  requireMock();
  const { mockChat } = await import("./mockChat");
  return mockChat(message, history, level, appState);
}

export const MOCK_SCORE_FORMULA =
  "Mock score / 100 = 0.35 × sunlight % + 0.30 × Earth visibility % + 0.20 × (100 − longest night h ÷ 3) + 0.15 × (100 − longest communication gap h ÷ 2.5). Higher is better; all source metrics are illustrative.";
