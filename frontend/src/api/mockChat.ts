import type {
  ChatAction,
  ChatAppState,
  ChatLevel,
  ChatMessage,
  ChatResponse,
  Site,
} from "./index";
import { getSite, getSites, getSky } from "./index";
import { DATE_MAX, DATE_MIN } from "./config";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function findSite(message: string, sites: Site[]): Site | undefined {
  const normalizedMessage = normalize(message);
  const exact = sites.find((site) => normalizedMessage.includes(normalize(site.name)));
  if (exact) return exact;
  const words = normalizedMessage.split(" ").filter((word) => word.length >= 4);
  const candidates = sites.map((site) => {
    const name = normalize(site.name);
    const parts = name.split(" ").filter((part) => part.length >= 4);
    const best = Math.min(...parts.map((part) =>
      words.reduce((score, word) => Math.min(score, distance(word, part)), Infinity),
    ));
    return { site, best, threshold: Math.max(1, Math.floor(Math.max(...parts.map((part) => part.length)) * 0.28)) };
  });
  return candidates.find(({ best, threshold }) => best <= threshold)?.site;
}

function parseDate(message: string, currentDate: string): string | null {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/\bnext week\b/i.test(message)) {
    const date = new Date(`${currentDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().slice(0, 10);
  }
  const natural = message.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  if (!natural) return null;
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = monthNames.findIndex((name) => name.startsWith(natural[2].toLowerCase()));
  const year = natural[3] ?? currentDate.slice(0, 4);
  return `${year}-${String(month + 1).padStart(2, "0")}-${natural[1].padStart(2, "0")}`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatNumber(value: number, suffix: string): string {
  return `${value.toFixed(1)}${suffix}`;
}

export async function mockChat(
  message: string,
  _history: ChatMessage[],
  level: ChatLevel,
  appState: ChatAppState,
): Promise<ChatResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 420));
  const sites = getSites();
  const actions: ChatAction[] = [];
  const rejected: ChatResponse["rejected"] = [];
  const lower = normalize(message);
  const matchedSite = findSite(message, sites);
  const date = parseDate(message, appState.selected_date);
  const dateIsValid = date !== null && isValidDate(date);

  if (date) {
    if (!dateIsValid || date < DATE_MIN || date > DATE_MAX) {
      rejected.push({
        tool: "set_date",
        error: !dateIsValid
          ? `${date} is not a valid calendar date.`
          : `Date ${date} is outside the available mock-data range (${DATE_MIN} to ${DATE_MAX}).`,
        suggestions: [`Try a valid date between ${DATE_MIN} and ${DATE_MAX}.`],
      });
    } else {
      actions.push({ type: "set_date", args: { date } });
    }
  }

  const compareRequested = /\b(compare|versus| vs |rank|best site)\b/.test(` ${lower} `);
  if (compareRequested) {
    const mentioned = sites.filter((site) => {
      const name = normalize(site.name);
      return lower.includes(name) || name.split(" ").some((part) => part.length >= 4 && lower.split(" ").includes(part));
    });
    if (mentioned.length >= 2) {
      actions.push({
        type: "compare_sites",
        args: { ids: mentioned.slice(0, 3).map((site) => site.id), names: mentioned.slice(0, 3).map((site) => site.name) },
      });
    } else {
      const shortlist = sites.slice(0, 3);
      actions.push({ type: "compare_sites", args: { ids: shortlist.map((site) => site.id), names: shortlist.map((site) => site.name) } });
    }
  }

  if (matchedSite) {
    actions.push({ type: "select_site", args: { id: matchedSite.id, name: matchedSite.name } });
  } else if (!date && !/\b(sky|sun|earth|visible|horizon)\b/.test(lower) &&
    /\b(show|tell me|compare|visit|open|take me to)\b/.test(lower)) {
    const requestWords = lower.split(" ").filter((word) => word.length >= 4);
    const closest = sites
      .map((site) => {
        const nameWords = normalize(site.name).split(" ").filter((word) => word.length >= 4);
        return { site, score: Math.min(...nameWords.map((word) => Math.min(...requestWords.map((part) => distance(word, part))))) };
      })
      .sort((a, b) => a.score - b.score)[0];
    if (closest) rejected.push({
      tool: "select_site",
      error: `I couldn't match that site name. Did you mean ${closest.score <= 3 ? `${closest.site.name}, or another candidate` : "one of these candidates"}?`,
      suggestions: sites.map((site) => site.name).slice(0, 5),
    });
  }

  if (/\b(sky|sun|earth|visible|horizon)\b/.test(lower)) {
    actions.push({ type: "set_view", args: { view: "site" } });
  } else if (/\b(map|heatmap|polar)\b/.test(lower)) {
    actions.push({ type: "set_view", args: { view: "heatmap" } });
  } else if (/\b(globe|orbit|moon)\b/.test(lower)) {
    actions.push({ type: "set_view", args: { view: "globe" } });
  }

  let text: string;
  const asksAboutRisk = /\b(why|risky|risk|good|score|suitable)\b/.test(lower);
  const answerSite = matchedSite ?? (asksAboutRisk ? sites.find((site) => site.id === appState.selected_site) : undefined);
  if (answerSite && asksAboutRisk) {
    const detail = getSite(answerSite.name);
    const p = detail.parameters;
    const reasons = [
      `${formatNumber(p.sun_visible_pct, "%")} sunlight`,
      `${formatNumber(p.longest_night_h, " h")} longest night`,
      `${formatNumber(p.earth_visible_pct, "%")} Earth visibility`,
      `${formatNumber(p.longest_comm_gap_h, " h")} longest communication gap`,
    ];
    const flag = p.sun_visible_pct < 50 || p.earth_visible_pct < 50 ? "has trade-offs" : "looks promising";
    text = level === "expert"
      ? `${answerSite.name} scores ${answerSite.score}/100 and ${flag}: ${reasons.join(", ")}. These are mock planning indicators, not a mission certification.`
      : `${answerSite.name} ${flag}. Its modeled daylight and Earth sightlines are ${p.sun_visible_pct < 50 || p.earth_visible_pct < 50 ? "more limited" : "relatively favorable"}; compare the night length and communication gaps before choosing.`;
  } else if (compareRequested) {
    text = "I’ve opened a side-by-side comparison. The score and each lighting/communications metric come from the local mock evaluator.";
  } else if (date && !rejected.length) {
    text = `The timeline is now set to ${date}. Sun and Earth positions update from the local sky model.`;
  } else if (matchedSite) {
    text = `Opening ${matchedSite.name}. ${matchedSite.score === null ? "Its score is not available." : `Its mock suitability score is ${matchedSite.score}/100.`} Ask me why it may be a good fit or compare it with another site.`;
  } else {
    text = "I can open a landing site, compare locations, change the date, or show the surface sky. Try naming Shackleton Rim or asking for 12 March.";
  }

  if (date && !rejected.length && matchedSite && /\b(sky|sun|earth)\b/.test(lower)) {
    const sky = getSky(matchedSite.id, date);
    text += ` For ${matchedSite.name}, the modeled Sun is ${sky.sun.el.toFixed(1)}° above the horizon and Earth is ${sky.earthVisible ? "visible" : "below the local horizon"}.`;
  } else if (appState.selected_site && /\bsky\b/.test(lower) && !matchedSite) {
    const current = sites.find((site) => site.id === appState.selected_site);
    if (current) text += ` The current sky view is for ${current.name}.`;
  }

  return { text, actions, rejected };
}
