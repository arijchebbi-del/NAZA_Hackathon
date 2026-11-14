import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DATE_MAX, DATE_MIN, getTimeline } from "../api";
import type { TimelinePoint } from "../api";
import { Icon } from "./Icons";

interface TimelineProps {
  siteId: string;
  selectedDate: string;
  onChange: (date: string) => void;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startAround(value: string): string {
  const proposed = shiftDate(value, -15);
  if (proposed < DATE_MIN) return DATE_MIN;
  const latestStart = shiftDate(DATE_MAX, -30);
  return proposed > latestStart ? latestStart : proposed;
}

function formatShort(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Timeline({ siteId, selectedDate, onChange }: TimelineProps) {
  const [start, setStart] = useState(() => startAround(selectedDate));
  const [playing, setPlaying] = useState(false);
  const end = useMemo(() => {
    const proposed = shiftDate(start, 30);
    return proposed > DATE_MAX ? DATE_MAX : proposed;
  }, [start]);
  const points = useMemo(() => getTimeline(siteId, start, end), [siteId, start, end]);
  const availableDays = Math.max(1, Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  ));
  const dayIndex = Math.max(0, Math.min(30, Math.round(
    (Date.parse(`${selectedDate}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  )));

  useEffect(() => {
    if (selectedDate < start || selectedDate > end) setStart(startAround(selectedDate));
  }, [selectedDate, start, end]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (dayIndex >= availableDays) {
        setPlaying(false);
      } else {
        onChange(shiftDate(selectedDate, 1));
      }
    }, 390);
    return () => window.clearInterval(timer);
  }, [availableDays, dayIndex, onChange, playing, selectedDate]);

  function bandClass(point: TimelinePoint, band: "sun" | "earth"): string {
    const visible = band === "sun" ? point.sunVisible : point.earthVisible;
    return visible ? (band === "sun" ? "timeline-sun-on" : "timeline-earth-on") : "timeline-off";
  }

  return (
    <section className="timeline-panel" aria-label="Thirty day sunlight and communications timeline">
      <div className="timeline-header">
        <div className="timeline-title">
          <div className="eyebrow">LUNAR CYCLE / 30 DAYS</div>
          <strong>Light & line of sight</strong>
        </div>
        <button className={`play-button ${playing ? "is-playing" : ""}`} onClick={() => {
          if (!playing) setStart(selectedDate <= shiftDate(DATE_MAX, -30) ? selectedDate : shiftDate(DATE_MAX, -30));
          setPlaying((value) => !value);
        }} aria-label={playing ? "Pause timeline" : "Play lunar cycle"}>
          <Icon name={playing ? "pause" : "play"} size={14} />
          {playing ? "PAUSE" : "PLAY CYCLE"}
        </button>
      </div>
      <div className="timeline-legend">
        <span><i className="legend-dash sun" /> Sun visible</span>
        <span><i className="legend-dash earth" /> Earth visible</span>
        <span><i className="legend-dash shadow" /> In shadow / occluded</span>
      </div>
      <div className="timeline-plot">
        <div className="timeline-rows">
          <span className="timeline-row-label">SUN</span>
          <div className="timeline-band">
            {points.slice(0, 30).map((point, index) => <i key={`sun-${index}`} className={bandClass(point, "sun")} />)}
          </div>
          <span className="timeline-row-label">EARTH</span>
          <div className="timeline-band">
            {points.slice(0, 30).map((point, index) => <i key={`earth-${index}`} className={bandClass(point, "earth")} />)}
          </div>
        </div>
        <div className="timeline-dates"><span>{formatShort(start)}</span><span>{formatShort(shiftDate(start, 15))}</span><span>{formatShort(end)}</span></div>
        <input
          className="timeline-range"
          type="range"
          min={0}
          max={availableDays}
          value={dayIndex}
          aria-label="Selected day in 30-day timeline"
          style={{ "--range-progress": `${(dayIndex / 30) * 100}%` } as CSSProperties}
          onChange={(event) => onChange(shiftDate(start, Number(event.currentTarget.value)))}
        />
        <div className="timeline-cursor-label" style={{ left: `${(dayIndex / 30) * 100}%` }}>
          {formatShort(selectedDate)}
        </div>
      </div>
    </section>
  );
}
