import { DATE_MAX, getSite, getSky, getTimeline, MOCK_SCORE_FORMULA } from "../api";
import type { Site, SiteParameters } from "../api";
import { useStore } from "../store/useStore";
import { Icon } from "./Icons";

interface ComparisonPanelProps {
  sites: Site[];
  onClose: () => void;
}

const metrics: { key: keyof SiteParameters; label: string; unit: string; lowerBetter: boolean }[] = [
  { key: "sun_visible_pct", label: "Sun visible", unit: "%", lowerBetter: false },
  { key: "longest_night_h", label: "Longest night", unit: " h", lowerBetter: true },
  { key: "earth_visible_pct", label: "Earth visible", unit: "%", lowerBetter: false },
  { key: "longest_comm_gap_h", label: "Longest comms gap", unit: " h", lowerBetter: true },
];

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function MiniSky({ site, date }: { site: Site; date: string }) {
  const sky = getSky(site.id, date);
  const proposedEnd = shiftDate(date, 10);
  const timeline = getTimeline(site.id, date, proposedEnd > DATE_MAX ? DATE_MAX : proposedEnd);
  const x = (azimuth: number) => 12 + (azimuth / 360) * 156;
  const y = (elevation: number) => 71 - Math.max(0, Math.min(12, elevation)) * 4;
  return (
    <div className="mini-sky">
      <div className="mini-sky-title">TODAY’S SKY <span>{date.slice(5)}</span></div>
      <svg viewBox="0 0 180 82" aria-label={`Sun and Earth positions over ${site.name}`}>
        <path d="M8 70 Q42 63 68 67 T118 64 T172 68 L172 80 L8 80Z" fill="#222c2d" />
        <path d="M8 70 Q42 63 68 67 T118 64 T172 68" fill="none" stroke="#71817b" strokeWidth="1" />
        <line x1={x(sky.sun.az)} x2={x(sky.sun.az)} y1={y(sky.sun.el)} y2="68" stroke="#e6b56c" strokeOpacity=".25" strokeDasharray="2 3" />
        <circle cx={x(sky.sun.az)} cy={y(sky.sun.el)} r="3.5" fill="#efb769" />
        <line x1={x(sky.earth.az)} x2={x(sky.earth.az)} y1={y(sky.earth.el)} y2="68" stroke="#83bed1" strokeOpacity=".25" strokeDasharray="2 3" />
        <circle cx={x(sky.earth.az)} cy={y(sky.earth.el)} r="3" fill="#82bed1" />
      </svg>
      <div className="mini-timeline">
        {timeline.slice(0, 10).map((point, index) => <i key={index} className={point.sunVisible ? "sun" : "off"} title={`${point.t}: ${point.sunVisible ? "sun visible" : "shadow"}`} />)}
      </div>
      <div className="mini-timeline-label"><span>LIGHT</span><span>+10 DAYS</span></div>
    </div>
  );
}

export default function ComparisonPanel({ sites, onClose }: ComparisonPanelProps) {
  const selectedDate = useStore((state) => state.selectedDate);
  const setDate = useStore((state) => state.setSelectedDate);
  const setCompareIds = useStore((state) => state.setCompareIds);
  const columns = sites
    .map((site) => ({ site, detail: getSite(site.id) }))
    .sort((a, b) => (b.site.score ?? -1) - (a.site.score ?? -1));
  const bestByMetric = new Map<keyof SiteParameters, number>();
  const worstByMetric = new Map<keyof SiteParameters, number>();
  for (const metric of metrics) {
    const values = columns.map(({ detail }) => detail.parameters[metric.key]);
    bestByMetric.set(metric.key, metric.lowerBetter ? Math.min(...values) : Math.max(...values));
    worstByMetric.set(metric.key, metric.lowerBetter ? Math.max(...values) : Math.min(...values));
  }

  return (
    <section className="comparison-panel">
      <div className="comparison-heading">
        <div>
          <div className="eyebrow">MISSION TRADE STUDY / SIDE-BY-SIDE</div>
          <h2>Compare candidate sites <span>{columns.length} sites</span></h2>
        </div>
        <div className="comparison-actions">
          <button className="delay-button" onClick={() => setDate(shiftDate(selectedDate, 10))}><Icon name="clock" size={14} /> WHAT IF +10 DAYS?</button>
          <button className="icon-button" aria-label="Close comparison" onClick={onClose}><Icon name="close" size={17} /></button>
        </div>
      </div>
      {columns.length < 2 ? (
        <div className="empty-panel">Select two or three sites to start a comparison.</div>
      ) : (
        <>
          <div className="compare-cards">
            {columns.map(({ site }, index) => (
              <article className={`compare-site-card ${index === 0 ? "rank-first" : ""}`} key={site.id}>
                <div className="rank-label"><span>0{index + 1}</span> {index === 0 ? "BEST CURRENT SCORE" : "CANDIDATE"}</div>
                <h3>{site.name}</h3>
                <span className="compare-site-type">{site.type} · {Math.abs(site.lat).toFixed(1)}° S</span>
                <div className="score-display"><strong>{site.score ?? "—"}</strong><span>/100</span><i className="score-delta">{index === 0 ? "LEADING" : `−${(columns[0].site.score ?? 0) - (site.score ?? 0)} PTS`}</i></div>
                <MiniSky site={site} date={selectedDate} />
              </article>
            ))}
          </div>
          <div className="parameter-table-wrap">
            <table className="parameter-table">
              <thead><tr><th>MISSION PARAMETER</th>{columns.map(({ site }) => <th key={site.id}>{site.name}</th>)}</tr></thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.key}>
                    <td>{metric.label}<small>{metric.lowerBetter ? "LOWER IS BETTER" : "HIGHER IS BETTER"}</small></td>
                    {columns.map(({ site, detail }) => {
                      const value = detail.parameters[metric.key];
                      return <td key={site.id} className={value === bestByMetric.get(metric.key) ? "best-value" : value === worstByMetric.get(metric.key) ? "worst-value" : ""}>{value}{metric.unit}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="formula-note"><Icon name="info" size={13} /> {MOCK_SCORE_FORMULA}</p>
        </>
      )}
      <button className="comparison-collapse" onClick={() => setCompareIds([])}>CLOSE COMPARISON <Icon name="chevron" size={14} /></button>
    </section>
  );
}
