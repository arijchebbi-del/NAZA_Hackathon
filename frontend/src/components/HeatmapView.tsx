import type { Site } from "../api";

interface HeatmapViewProps {
  sites: Site[];
  selectedSiteId: string | null;
  onSelect: (id: string) => void;
}

function color(score: number | null): string {
  if (score === null) return "#87939b";
  if (score >= 70) return "#a8ef88";
  if (score >= 40) return "#f5b765";
  return "#ee6f69";
}

function polarPosition(site: Site): { x: number; y: number } {
  const radius = Math.max(5, (90 + site.lat) * 23);
  const longitude = site.lon * Math.PI / 180;
  return { x: 360 + Math.sin(longitude) * radius, y: 310 - Math.cos(longitude) * radius };
}

export default function HeatmapView({ sites, selectedSiteId, onSelect }: HeatmapViewProps) {
  if (!sites.length) {
    return <div className="empty-panel">No sites are available to map yet.</div>;
  }
  return (
    <div className="polar-map-wrap">
      <div className="map-topline">
        <div>
          <div className="eyebrow">LUNAR SOUTH POLE / STEREOGRAPHIC</div>
          <h2>High ground. Clear sightlines.</h2>
          <p>Sites cluster around the pole; the local mock suitability score drives the halo.</p>
        </div>
        <div className="map-coordinate">90° S <span>·</span> 0° E</div>
      </div>
      <div className="polar-map">
        <svg
          viewBox="0 0 720 620"
          role="img"
          aria-label="Polar projection of lunar south pole landing sites"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const scale = Math.min(bounds.width / 720, bounds.height / 620);
            const offsetX = (bounds.width - 720 * scale) / 2;
            const offsetY = (bounds.height - 620 * scale) / 2;
            const x = (event.clientX - bounds.left - offsetX) / scale;
            const y = (event.clientY - bounds.top - offsetY) / scale;
            const nearest = sites
              .map((site) => {
                const position = polarPosition(site);
                return { site, distance: Math.hypot(position.x - x, position.y - y) };
              })
              .sort((a, b) => a.distance - b.distance)[0];
            if (nearest && nearest.distance <= 24) onSelect(nearest.site.id);
          }}
        >
          <defs>
            <radialGradient id="lunar-basin">
              <stop offset="0%" stopColor="#12191b" />
              <stop offset="72%" stopColor="#1c2526" />
              <stop offset="100%" stopColor="#111719" />
            </radialGradient>
            {sites.map((site) => {
              const spread = 26 + (site.score ?? 0) * 0.23;
              return (
                <radialGradient key={site.id} id={`heat-${site.id}`}>
                  <stop offset="0%" stopColor={color(site.score)} stopOpacity=".5" />
                  <stop offset={`${spread}%`} stopColor={color(site.score)} stopOpacity=".22" />
                  <stop offset="100%" stopColor={color(site.score)} stopOpacity="0" />
                </radialGradient>
              );
            })}
          </defs>
          <circle cx="360" cy="310" r="248" fill="url(#lunar-basin)" stroke="#384649" strokeWidth="1.2" pointerEvents="none" />
          {[62, 124, 186, 248].map((radius) => (
            <circle key={radius} cx="360" cy="310" r={radius} fill="none" stroke="#516265" strokeOpacity=".33" strokeDasharray={radius === 248 ? "2 4" : "1 5"} pointerEvents="none" />
          ))}
          <path d="M112 310h496M360 62v496M185 135l350 350M535 135 185 485" stroke="#435355" strokeOpacity=".28" strokeDasharray="3 7" pointerEvents="none" />
          <text x="360" y="46" textAnchor="middle" className="map-latitude" pointerEvents="none">90° S</text>
          <text x="366" y="306" className="map-latitude" pointerEvents="none">POLE</text>
          <text x="365" y="557" className="map-latitude" pointerEvents="none">EQUATORWARD</text>
          {sites.map((site) => {
            const { x, y } = polarPosition(site);
            return <circle key={`heat-${site.id}`} cx={x} cy={y} r={50 + (site.score ?? 0) * 0.42} fill={`url(#heat-${site.id})`} pointerEvents="none" />;
          })}
          {sites.map((site) => {
            const { x, y } = polarPosition(site);
            const selected = site.id === selectedSiteId;
            return (
              <g key={site.id} className="map-marker" pointerEvents="all" role="button" tabIndex={0} aria-label={`${site.name}, score ${site.score ?? "unavailable"}`} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(site.id);
              }}>
                <circle cx={x} cy={y} r="17" fill="transparent" />
                {selected && <circle cx={x} cy={y} r="11" fill="none" stroke="#f3f5ef" strokeWidth="1" strokeDasharray="3 2" />}
                <circle cx={x} cy={y} r={selected ? 5.8 : 4.2} fill={color(site.score)} stroke="#101718" strokeWidth="1.5" />
                <text x={x + 9} y={y - 7} className={`map-site-label ${selected ? "map-site-label-active" : ""}`}>{site.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map-legend">
        <span><i className="legend-dot good" /> High suitability</span>
        <span><i className="legend-dot mid" /> Moderate</span>
        <span><i className="legend-dot low" /> Caution</span>
        <span className="legend-note">Projection distance from pole is exaggerated for readability.</span>
      </div>
    </div>
  );
}
