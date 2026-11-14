import { useMemo } from "react";
import { getHorizonProfile, getSite, getSky } from "../api";
import type { Site } from "../api";
import { Icon } from "./Icons";
import Timeline from "./Timeline";

interface SiteViewProps {
  site: Site;
  selectedDate: string;
  level: "expert" | "decouverte";
  educationalMode: boolean;
  onDateChange: (date: string) => void;
}

function polarPoint(azimuth: number, elevation: number, radius: number, centerX: number, centerY: number): [number, number] {
  const angle = (azimuth / 360) * Math.PI * 2 - Math.PI / 2;
  const distance = radius - Math.max(-3, Math.min(14, elevation)) * 5.2;
  return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance];
}

function status(value: number, lowerIsBetter = false): "good" | "warn" | "bad" {
  if (lowerIsBetter) return value < 60 ? "good" : value < 120 ? "warn" : "bad";
  return value >= 70 ? "good" : value >= 45 ? "warn" : "bad";
}

function metricText(value: number, unit: string, level: "expert" | "decouverte", good: boolean): string {
  if (level === "expert") return `${value.toFixed(1)}${unit}`;
  if (unit === "%") return good ? "Favorable" : "À surveiller";
  return good ? "Faible" : "À surveiller";
}

export default function SiteView({ site, selectedDate, level, educationalMode, onDateChange }: SiteViewProps) {
  const sky = useMemo(() => getSky(site.id, selectedDate), [site.id, selectedDate]);
  const horizon = useMemo(() => getHorizonProfile(site.id), [site.id]);
  const detail = useMemo(() => getSite(site.id), [site.id]);
  const { terrainPath, horizonPath } = useMemo(() => {
    const points = horizon.map((point) => polarPoint(point.az, point.el, 158, 390, 208));
    const profilePath = points.map(([x, y], index) =>
      `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`,
    ).join(" ");
    return {
      terrainPath: `M0 0H780V320H0Z ${profilePath} Z`,
      horizonPath: profilePath,
    };
  }, [horizon]);
  const sunPosition = polarPoint(sky.sun.az, sky.sun.el, 158, 390, 208);
  const earthPosition = polarPoint(sky.earth.az, sky.earth.el, 158, 390, 208);
  const p = detail.parameters;
  const powerStatus = status(p.sun_visible_pct);
  const commStatus = status(p.earth_visible_pct);
  const randomStars = Array.from({ length: 42 }, (_, index) => ({
    x: (index * 73 + 41) % 760,
    y: (index * 47 + 17) % 210,
    r: ((index * 13) % 10) / 10 + 0.6,
  }));
  const elevationLabel = level === "expert" ? `${sky.sun.el.toFixed(1)}°` : sky.sun.el > 1.4 ? "LOW · VISIBLE" : "VERY LOW";

  return (
    <div className="site-view">
      <div className="site-view-heading">
        <div>
          <div className="eyebrow">SURFACE OBSERVATORY / {site.lat.toFixed(1)}° S · {site.lon.toFixed(1)}° E</div>
          <h2>{site.name}<span className="heading-separator">/</span>Sky conditions</h2>
        </div>
        <span className="surface-date"><Icon name="clock" size={14} /> {new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
      </div>
      <div className="sky-card">
        <div className="sky-card-top">
          <span><i className="live-dot" /> LIVE HORIZON MODEL</span>
          <span>NO ATMOSPHERE · 360° PROFILE</span>
        </div>
        <svg className="sky-visual" viewBox="0 0 780 320" role="img" aria-label={`Surface sky at ${site.name}: Sun ${sky.sun.el.toFixed(1)} degrees, Earth ${sky.earth.el.toFixed(1)} degrees`}>
          <defs>
            <linearGradient id="lunar-surface" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#515858" />
              <stop offset="100%" stopColor="#262e2e" />
            </linearGradient>
            <radialGradient id="sky-glow"><stop offset="0%" stopColor="#172328" stopOpacity=".4" /><stop offset="100%" stopColor="#090d10" stopOpacity="0" /></radialGradient>
          </defs>
          <rect x="0" y="0" width="780" height="320" rx="8" fill="#080c0f" />
          <ellipse cx="390" cy="205" rx="340" ry="155" fill="url(#sky-glow)" />
          {randomStars.map((star, index) => <circle key={index} cx={star.x + 10} cy={star.y + 6} r={star.r} fill="#d5e0dc" opacity={0.25 + (index % 5) * 0.12} />)}
          <path d="M24 208H756" stroke="#71807f" strokeOpacity=".24" strokeDasharray="2 7" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((azimuth) => {
            const [x] = polarPoint(azimuth, 0, 158, 390, 208);
            return <g key={azimuth}><line x1={x} y1="193" x2={x} y2="201" stroke="#8c9996" strokeOpacity=".42" /><text x={x} y="187" textAnchor="middle" className="sky-az-label">{azimuth}°</text></g>;
          })}
          <path d={terrainPath} fill="url(#lunar-surface)" fillRule="evenodd" />
          <path d={horizonPath} fill="none" stroke="#a1aaa5" strokeWidth="1.5" />
          <line x1="28" y1="208" x2="752" y2="208" stroke="#a9b5b1" strokeOpacity=".33" />
          {sky.sunVisible && <line x1={sunPosition[0]} y1={sunPosition[1]} x2={sunPosition[0]} y2="202" stroke="#f4b76b" strokeOpacity=".4" strokeDasharray="3 4" />}
          {sky.earthVisible && <line x1={earthPosition[0]} y1={earthPosition[1]} x2={earthPosition[0]} y2="202" stroke="#80c7dc" strokeOpacity=".42" strokeDasharray="3 4" />}
          <g transform={`translate(${sunPosition[0]} ${sunPosition[1]})`} className={sky.sunVisible ? "" : "celestial-hidden"}>
            <circle r="19" fill="#f3b360" opacity=".11" /><circle r="8" fill="#f7c778" /><circle r="3" fill="#fff1c8" />
            <text x="0" y="-25" textAnchor="middle" className="celestial-label sun-label">SUN · {elevationLabel}</text>
          </g>
          <g transform={`translate(${earthPosition[0]} ${earthPosition[1]})`} className={sky.earthVisible ? "" : "celestial-hidden"}>
            <circle r="15" fill="#6bbbd9" opacity=".14" /><circle r="7" fill="#579fbd" /><path d="M-5-3q4 4 2 8m5-12q-2 4 2 7" fill="none" stroke="#bbd9dd" strokeWidth="1.4" />
            <text x="0" y="-23" textAnchor="middle" className="celestial-label earth-label">EARTH</text>
          </g>
        </svg>
        <div className="sky-caption">
          <span><i className="sky-swatch sun" />{level === "expert" ? `Sun az ${Math.round(sky.sun.az)}° / el ${sky.sun.el.toFixed(1)}°` : "Sun skims the local horizon"}</span>
          <span><i className="sky-swatch earth" />{level === "expert" ? `Earth az ${Math.round(sky.earth.az)}° / el ${sky.earth.el.toFixed(1)}°` : sky.earthVisible ? "Earth is in sight" : "Earth is below the ridge"}</span>
          <span className="horizon-caption">Horizon profile · mock terrain</span>
        </div>
      </div>

      <div className="metrics-grid">
        <article className={`metric-card ${powerStatus}`}>
          <span className="metric-icon sun"><Icon name="sun" size={16} /></span>
          <div className="metric-label">SUN ELEVATION</div>
          <strong>{level === "expert" ? `${sky.sun.el.toFixed(1)}°` : elevationLabel}</strong>
          <small>{level === "expert"
            ? sky.sunVisible ? `Sunset in ${sky.timeToSunsetH.toFixed(1)} h` : "Sun below local horizon"
            : sky.sunVisible ? "Sun remains above the local ridge" : "Sun is hidden by the local ridge"}</small>
        </article>
        <article className={`metric-card ${powerStatus}`}>
          <span className="metric-icon sun"><Icon name="clock" size={16} /></span>
          <div className="metric-label">SUNLIGHT</div>
          <strong>{metricText(p.sun_visible_pct, "%", level, powerStatus === "good")}</strong>
          <small>{level === "expert" ? `${p.longest_night_h} h longest night` : p.longest_night_h < 120 ? "Dark periods are relatively short" : "Extended darkness is a planning risk"}</small>
        </article>
        <article className={`metric-card ${commStatus}`}>
          <span className="metric-icon earth"><Icon name="earth" size={16} /></span>
          <div className="metric-label">EARTH VISIBILITY</div>
          <strong>{level === "expert" ? `${sky.earth.el.toFixed(1)}° ${sky.earthVisible ? "VISIBLE" : "OCCLUDED"}` : sky.earthVisible ? "IN SIGHT" : "BELOW RIDGE"}</strong>
          <small>{level === "expert"
            ? sky.earthVisible ? `Earthset in ${sky.timeToEarthsetH.toFixed(1)} h` : "Earth below local horizon"
            : sky.earthVisible ? "Earth remains above the local ridge" : "Earth is hidden by the local ridge"}</small>
        </article>
        <article className={`metric-card ${commStatus}`}>
          <span className="metric-icon earth"><Icon name="compass" size={16} /></span>
          <div className="metric-label">COMMUNICATIONS</div>
          <strong>{metricText(p.earth_visible_pct, "%", level, commStatus === "good")}</strong>
          <small>{level === "expert" ? `${p.longest_comm_gap_h} h longest gap` : p.longest_comm_gap_h < 60 ? "Communication gaps are shorter" : "Long communication gaps are a risk"}</small>
        </article>
      </div>
      <div className="verdict-row">
        <div className={`verdict-pill ${powerStatus}`}><Icon name={powerStatus === "good" ? "check" : "warning"} size={14} /><b>POWER</b><span>{powerStatus === "good" ? "OK" : powerStatus === "warn" ? "RISKY" : "BAD"}</span></div>
        <div className={`verdict-pill ${commStatus}`}><Icon name={commStatus === "good" ? "check" : "warning"} size={14} /><b>COMMUNICATIONS</b><span>{commStatus === "good" ? "OK" : commStatus === "warn" ? "RISKY" : "BAD"}</span></div>
        {educationalMode && <div className="educational-note"><Icon name="info" size={14} /><span>The Moon's slight axial tilt keeps polar sunlight low; a few days can shift the horizon angle and move a ridge's shadow.</span></div>}
      </div>
      <Timeline siteId={site.id} selectedDate={selectedDate} onChange={onDateChange} />
    </div>
  );
}
