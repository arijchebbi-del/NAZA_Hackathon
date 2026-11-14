import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DATE_MAX, DATE_MIN, getSite } from "./api";
import { USE_MOCK } from "./api/config";
import type { Site, View } from "./api";
import GlobeScene from "./components/GlobeScene";
import HeatmapView from "./components/HeatmapView";
import SiteView from "./components/SiteView";
import Timeline from "./components/Timeline";
import ComparisonPanel from "./components/ComparisonPanel";
import ChatPanel from "./components/ChatPanel";
import { Icon } from "./components/Icons";
import { useStore } from "./store/useStore";

const views: { id: View; label: string; icon: "globe" | "site" | "map" }[] = [
  { id: "globe", label: "Globe", icon: "globe" },
  { id: "site", label: "Site", icon: "site" },
  { id: "heatmap", label: "Heatmap", icon: "map" },
];

function scoreColor(score: number | null): string {
  if (score === null) return "score-muted";
  if (score >= 70) return "score-good";
  if (score >= 40) return "score-mid";
  return "score-low";
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function SceneFallback() {
  return <div className="scene-fallback"><div className="moon-loader" /><span>INITIALIZING LUNAR SURVEY</span></div>;
}

export default function App() {
  const sites = useStore((state) => state.sites);
  const selectedSiteId = useStore((state) => state.selectedSiteId);
  const selectedDate = useStore((state) => state.selectedDate);
  const view = useStore((state) => state.view);
  const compareIds = useStore((state) => state.compareIds);
  const level = useStore((state) => state.level);
  const freeFlight = useStore((state) => state.freeFlight);
  const chatOpen = useStore((state) => state.chatOpen);
  const educationalMode = useStore((state) => state.educationalMode);
  const undoHistory = useStore((state) => state.undoHistory);
  const selectSite = useStore((state) => state.selectSite);
  const setDate = useStore((state) => state.setSelectedDate);
  const setView = useStore((state) => state.setView);
  const setCompareIds = useStore((state) => state.setCompareIds);
  const setFreeFlight = useStore((state) => state.setFreeFlight);
  const setEducationalMode = useStore((state) => state.setEducationalMode);
  const undo = useStore((state) => state.undo);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const activeSite = selectedSite ?? sites[0] ?? null;
  const comparedSites = compareIds.map((id) => sites.find((site) => site.id === id)).filter((site): site is Site => site !== undefined);
  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sites.filter((site) => !query || `${site.name} ${site.type}`.toLowerCase().includes(query));
  }, [search, sites]);
  const details = useMemo(() => selectedSite ? getSite(selectedSite.id) : null, [selectedSite]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "1") setView("globe");
      if (event.key === "2") setView("site");
      if (event.key === "3") setView("heatmap");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key.toLowerCase() === "c") {
        if (compareIds.length) setCompareIds([]);
        else openComparison();
      }
      if (event.key === "Escape") {
        if (freeFlight) setFreeFlight(false);
        else if (view !== "globe") setView("globe");
        else selectSite(null);
      }
    }
    function openComparison() {
      if (sites.length < 2) return;
      const first = selectedSiteId ? sites.find((site) => site.id === selectedSiteId) : undefined;
      const next = [first, ...sites.filter((site) => site.id !== first?.id)].filter((site): site is Site => site !== undefined).slice(0, 3);
      setCompareIds(next.map((site) => site.id));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compareIds.length, freeFlight, selectSite, selectedSiteId, setCompareIds, setFreeFlight, setView, sites, view]);

  function compare() {
    if (compareIds.length > 1) {
      setCompareIds([]);
      return;
    }
    if (sites.length < 2) return;
    const first = selectedSite ?? sites[0];
    setCompareIds([first, ...sites.filter((site) => site.id !== first.id)].slice(0, 3).map((site) => site.id));
  }

  function chooseSite(id: string) {
    selectSite(id);
    setView("globe");
  }

  return (
    <div className={`app-shell ${chatOpen ? "chat-is-open" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /><i /><b /></div>
          <div className="brand-text"><strong>LUNAR<span>/</span>SITE</strong><small>MISSION PLANNING SYSTEM</small></div>
        </div>
        <div className="topbar-center"><span className="mission-dot" /> SOUTH POLE CANDIDATE SURVEY <span className="topbar-divider">/</span> ARTEMIS III</div>
        <div className="topbar-right">
          <span className="utc-readout"><i /> DATA RANGE ONLINE</span>
          <span className="topbar-separator" />
          <span className="topbar-date">{shortDate(selectedDate)} <span>·</span> {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC</span>
          <div className="avatar">MP</div>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-sidebar">
          <div className="sidebar-heading">
            <div><div className="eyebrow">MISSION CONTROL</div><h1>Landing sites</h1></div>
            <button className="square-button" title="Search sites" onClick={() => searchInput.current?.focus()}><Icon name="layers" size={16} /></button>
          </div>
          <label className="site-search">
            <Icon name="search" size={15} />
            <input ref={searchInput} value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Find a location…" />
            <span>⌘ K</span>
          </label>
          <div className="site-list-header"><span>POLAR CANDIDATES</span><span>{sites.length.toString().padStart(2, "0")}</span></div>
          <div className="site-list">
            {filteredSites.length ? filteredSites.map((site, index) => {
              const isSelected = site.id === selectedSiteId;
              return (
                <button key={site.id} className={`site-list-item ${isSelected ? "active" : ""}`} onClick={() => chooseSite(site.id)}>
                  <span className="site-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="site-list-copy"><strong>{site.name}</strong><small>{site.type} <i>·</i> {Math.abs(site.lat).toFixed(1)}° S</small></span>
                  <span className={`site-score ${scoreColor(site.score)}`}>{site.score ?? "—"}</span>
                </button>
              );
            }) : <div className="empty-sidebar">No sites match “{search}”.</div>}
          </div>
          <div className="sidebar-bottom">
            <div className="catalogue-count"><span className="count-icon"><Icon name="compass" size={15} /></span><span><b>{sites.length}</b><small>sites evaluated</small></span><i className="live-dot" /></div>
            <button className={`learn-toggle ${educationalMode ? "enabled" : ""}`} onClick={() => setEducationalMode(!educationalMode)}><Icon name="spark" size={15} /><span>Educational mode</span><i>{educationalMode ? "ON" : "OFF"}</i></button>
            <div className="side-footnote">SITE SCORES ARE ILLUSTRATIVE<br />NOT A MISSION CERTIFICATION</div>
          </div>
        </aside>

        <main className="main-workspace">
          <div className="view-toolbar">
            <div className="breadcrumbs"><span>MISSION DESIGN</span><Icon name="chevron" size={12} /><strong>{views.find((item) => item.id === view)?.label.toUpperCase()}</strong></div>
            <div className="view-controls">
              <div className="view-switch" role="tablist" aria-label="Site views">
                {views.map((item, index) => (
                  <button key={item.id} role="tab" aria-selected={view === item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} title={`${item.label} view (${index + 1})`}>
                    <Icon name={item.icon} size={15} /><span>{item.label}</span><kbd>{index + 1}</kbd>
                  </button>
                ))}
              </div>
              <span className="toolbar-divider" />
              <button aria-label={compareIds.length > 1 ? "Close site comparison" : "Compare sites"} className={`compare-trigger ${compareIds.length > 1 ? "active" : ""}`} onClick={compare}><Icon name="compare" size={16} /><span>{compareIds.length > 1 ? "Close compare" : "Compare"}</span><kbd>C</kbd></button>
              <span className="toolbar-divider" />
              <label className="date-picker" title="Choose mission date">
                <Icon name="clock" size={14} />
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={selectedDate} onChange={(event) => setDate(event.currentTarget.value)} aria-label="Mission date" />
              </label>
              {USE_MOCK && <span className="mock-badge"><i /> MOCK DATA</span>}
            </div>
          </div>

          <div className={`content-stage ${view === "site" ? "site-stage" : ""}`}>
            <AnimatePresence mode="wait">
              {view === "globe" && (
                <motion.section key="globe" className="globe-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <Suspense fallback={<SceneFallback />}>
                    <GlobeScene sites={sites} selectedSiteId={selectedSiteId} selectedDate={selectedDate} freeFlight={freeFlight} onSelect={selectSite} />
                  </Suspense>
                  <div className="scene-coordinate"><span className="eyebrow">LUNAR SOUTH POLE</span><strong>90° 00′ 00″ S <i>/</i> 000° 00′ 00″ E</strong><small>SELENOCENTRIC REFERENCE · MEAN RADIUS 1,737.4 KM</small></div>
                  <div className="scene-actions">
                    <button className={`flight-button ${freeFlight ? "active" : ""}`} onClick={() => setFreeFlight(!freeFlight)}><Icon name="flight" size={15} /><span>{freeFlight ? "EXIT FLIGHT" : "FREE FLIGHT"}</span><kbd>F</kbd></button>
                    <span className="scene-action-divider" />
                    <span className="orbit-tip">DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM</span>
                  </div>
                  {freeFlight && <div className="flight-hint">CLICK SCENE TO LOCK · WASD MOVE · SPACE / SHIFT ASCEND / DESCEND · ESC TO RELEASE</div>}
                  {!selectedSite && <div className="landing-prompt"><span className="prompt-line" /><Icon name="site" size={15} /><span>SELECT A CANDIDATE SITE TO BEGIN YOUR DESCENT</span><span className="prompt-line" /></div>}
                  {selectedSite && details && (
                    <aside className="site-inspector">
                      <div className="inspector-top"><span className="eyebrow">SELECTED LANDING ZONE</span><button className="icon-button" onClick={() => selectSite(null)} aria-label="Deselect site"><Icon name="close" size={15} /></button></div>
                      <div className="inspector-name"><span className={`inspector-score ${scoreColor(selectedSite.score)}`}>{selectedSite.score ?? "—"}</span><div><h2>{selectedSite.name}</h2><p>{selectedSite.type} <i>·</i> {Math.abs(selectedSite.lat).toFixed(1)}° S, {selectedSite.lon.toFixed(1)}° E</p></div></div>
                      <div className="inspector-stats"><div><span>POWER</span><b>{details.parameters.sun_visible_pct}%</b></div><div><span>EARTH LINK</span><b>{details.parameters.earth_visible_pct}%</b></div><div><span>LONGEST NIGHT</span><b>{details.parameters.longest_night_h}h</b></div></div>
                      <p className="inspector-description">{educationalMode ? "A few kilometers can shift a site behind a ridge—changing sunlight and Earth visibility." : "Modeled south-pole surface conditions."}</p>
                      <button className="land-button" onClick={() => setView("site")}><span><Icon name="site" size={16} /> LAND HERE</span><Icon name="arrow" size={16} /></button>
                      <button className="inspect-compare" onClick={() => setCompareIds([selectedSite.id, ...sites.filter((site) => site.id !== selectedSite.id).slice(0, 1).map((site) => site.id)])}><Icon name="compare" size={14} /> Add to comparison</button>
                    </aside>
                  )}
                  <div className="scene-legend">
                    <span><i className="legend-dot good" /> HIGH SCORE</span><span><i className="legend-dot mid" /> MODERATE</span><span><i className="legend-dot low" /> CAUTION</span>
                  </div>
                  <div className="scene-date-chip"><span>EARTH / {selectedDate}</span><i /></div>
                  <Timeline siteId={activeSite?.id ?? "shackleton-rim"} selectedDate={selectedDate} onChange={setDate} />
                </motion.section>
              )}
              {view === "site" && activeSite && (
                <motion.section key="site" className="site-stage-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
                  <SiteView site={activeSite} selectedDate={selectedDate} level={level} educationalMode={educationalMode} onDateChange={setDate} />
                </motion.section>
              )}
              {view === "site" && !activeSite && <div className="empty-main">Select a lunar site to observe its surface sky.</div>}
              {view === "heatmap" && (
                <motion.section key="heatmap" className="heatmap-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <HeatmapView sites={sites} selectedSiteId={selectedSiteId} onSelect={selectSite} />
                </motion.section>
              )}
            </AnimatePresence>
            {compareIds.length > 1 && (
              <ComparisonPanel sites={comparedSites} onClose={() => setCompareIds([])} />
            )}
          </div>
          <footer className="main-footer">
            <div><span className="footer-signal" /><span>LOCAL SIMULATION ACTIVE</span><i /> <span>NO BACKEND CONNECTION</span></div>
            <div className="footer-shortcuts"><button disabled={!undoHistory.length} onClick={undo}><Icon name="undo" size={13} /> UNDO</button><span>ESC <i>EXIT VIEW</i></span><span>1–3 <i>SWITCH VIEW</i></span></div>
          </footer>
        </main>
        <ChatPanel />
      </div>
    </div>
  );
}
