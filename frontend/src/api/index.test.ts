import { describe, expect, it } from "vitest";
import { getSite, getSites, getSky } from "./index";

describe("lunar site model", () => {
  it("provides scored South Pole landing sites", () => {
    const sites = getSites();

    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((site) => site.score !== null && site.lat < -80)).toBe(true);
    expect(sites.some((site) => site.id === "shackleton-rim")).toBe(true);
  });

  it("resolves site details by normalized name", () => {
    const detail = getSite("Shackleton Rim");

    expect(detail.id).toBe("shackleton-rim");
    expect(detail.parameters.sun_visible_pct).toBe(78);
  });

  it("returns repeatable sky conditions for a site and date", () => {
    const first = getSky("shackleton-rim", "2026-03-20");
    const second = getSky("shackleton-rim", "2026-03-20");

    expect(first).toEqual(second);
    expect(first.sun.az).toBeGreaterThanOrEqual(0);
    expect(first.sun.az).toBeLessThan(360);
  });
});
