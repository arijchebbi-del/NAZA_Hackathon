import type { View } from "../api";
import { getSites } from "../api";
import { useStore } from "../store/useStore";

const VALID_VIEWS: readonly View[] = ["globe", "site", "heatmap"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function executeAction(action: unknown): boolean {
  try {
    if (!isRecord(action) || typeof action.type !== "string") return false;
    const args = isRecord(action.args) ? action.args : {};
    const store = useStore.getState();

    switch (action.type) {
      case "select_site": {
        const site = getSites().find((item) =>
          (typeof args.id === "string" && item.id === args.id) ||
          (typeof args.name === "string" && item.name === args.name),
        );
        if (!site) return false;
        store.selectSite(site.id);
        store.setView("globe");
        return true;
      }
      case "set_date":
        if (!isIsoDate(args.date)) return false;
        store.setSelectedDate(args.date);
        return true;
      case "compare_sites":
        if (!Array.isArray(args.ids) || args.ids.length < 2 || args.ids.length > 3 ||
          !args.ids.every((id) => typeof id === "string" && store.sites.some((site) => site.id === id))) return false;
        store.setCompareIds(args.ids);
        return true;
      case "set_view":
        if (typeof args.view !== "string" || !VALID_VIEWS.includes(args.view as View)) return false;
        store.setView(args.view as View);
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
