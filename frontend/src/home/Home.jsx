import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import HomeScene from "./HomeScene";
import "./Home.css";

const PROJECT_NAME = "SELENE"; // change freely

const OBJECTIVES = [
  ["01", "Compare sites and dates", "Pick from known landing sites or enter any coordinates, then put scenarios side by side."],
  ["02", "See the sky from the surface", "Sun and Earth against the local horizon, at the date and time you choose."],
  ["03", "Read power and communication", "Sun elevation, sunlight duration and Earth visibility, reduced to clear indicators."],
  ["04", "Watch conditions change", "Scrub a lunar day and see exactly when the Sun or the Earth is lost."],
  ["05", "Re-plan fast", "When a launch slips, find which alternative dates or nearby sites remain viable."],
  ["06", "Open to everyone", "Technical detail for mission planners, plain explanations for students and the public."],
];

const FACTORS = [
  ["S1", "Slope", "Falls linearly from 1 on flat ground to 0 at 15° of steepness."],
  ["S2", "Sun elevation", "Elevation divided by 90°: the power available to solar arrays."],
  ["S3", "Earth elevation", "Elevation divided by 90°: the chance of a direct link to Earth."],
  ["S4", "No collision", "Probability of avoiding neighbouring bodies and terrain features."],
];

export default function Home({ onLand = () => {} }) {
  const scroll = useRef(0);
  const [landing, setLanding] = useState(false);

  useEffect(() => {
    const f = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = h > 0 ? Math.min(1, window.scrollY / h) : 0;
    };
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  const land = () => {
    if (landing) return;
    setLanding(true);
    setTimeout(onLand, 2600); // let the descent play, then open the app
  };

  return (
    <div className="home">
      <div className="stage" aria-hidden="true">
        <Canvas
          camera={{ fov: 40, near: 0.1, far: 300, position: [0, 0.35, 17] }}
          dpr={[1, 2]}
          gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
          shadows
        >
          <Suspense fallback={null}>
            <HomeScene scroll={scroll} landing={landing} />
          </Suspense>
        </Canvas>
      </div>

      <header className="nav">
        <span className="brand">{PROJECT_NAME}</span>
        <nav>
          <a href="#challenge">Challenge</a>
          <a href="#objectives">Objectives</a>
          <a href="#score">Score</a>
          <a href="#sources">Sources</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="mono rise d1">Lunar south pole · landing site evaluation</p>
          <h1 className="rise d2">Land where<br /><em>the light is.</em></h1>
          <p className="lead rise d3">
            Compare landing sites and dates in seconds: Sun, Earth, power and communication windows, read at the horizon.
          </p>
          <button className="land rise d4" onClick={land} disabled={landing}>
            <span className="ring" />
            {landing ? "Descending…" : "Begin landing"}
          </button>
          <span className="scrollhint mono rise d5">Scroll</span>
        </section>

        <section id="challenge" className="panel">
          <p className="mono">The challenge</p>
          <h2>The south pole is the hardest place to plan a landing.</h2>
          <div className="cols">
            <p>
              Near the poles the Sun never climbs far above the horizon, and terrain can hide it completely.
              A lunar night lasts about two weeks, so power and heat are decided by a few degrees and a few days.
            </p>
            <p>
              Earth sits low in the sky too, and the relief can cut the direct link. When a date or a site changes,
              planners need an answer quickly, not a tour through three specialist tools.
            </p>
          </div>
        </section>

        <section id="objectives" className="panel">
          <p className="mono">Objectives</p>
          <h2>One view to decide if a site and a date work.</h2>
          <div className="grid">
            {OBJECTIVES.map(([n, t, d]) => (
              <article key={n} className="card">
                <span className="mono">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="score" className="panel">
          <p className="mono">How a site is scored</p>
          <h2>A product of four factors, so one failure is visible.</h2>
          <p className="lead">
            Score = f(S1 × S2 × S3 × S4 + b), a relative index from 0 to 1. If any factor is zero, the whole score
            drops, and the tool tells you which one.
          </p>
          <div className="grid four">
            {FACTORS.map(([k, t, d]) => (
              <article key={k} className="card">
                <span className="mono">{k}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="sources" className="panel">
          <p className="mono">Data and references</p>
          <h2>Built on public lunar data.</h2>
          <ul className="sources">
            <li><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a><span>Sun and Earth positions</span></li>
            <li><a href="https://quickmap.lroc.asu.edu/" target="_blank" rel="noreferrer">Quickmap (LROC / ASU)</a><span>Imagery and topography</span></li>
            <li><a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">Moon Trek (NASA)</a><span>3D terrain exploration</span></li>
            <li><a href="https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" target="_blank" rel="noreferrer">CSA Moon Exploration</a><span>Missions and context</span></li>
          </ul>
        </section>

        <section className="panel final">
          <h2>Ready to choose a landing site?</h2>
          <button className="land" onClick={land} disabled={landing}>
            <span className="ring" />Begin landing
          </button>
        </section>
      </main>

      <div className={`fade ${landing ? "on" : ""}`} />
    </div>
  );
}
