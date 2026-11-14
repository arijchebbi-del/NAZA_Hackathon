/**
 * frontend/src/pages/Home.jsx
 *
 * Landing page: infinite starfield, a small 3D rocket, a moon on the horizon
 * and one call to action. Pure three.js (no react-three-fiber), so there is no
 * React version conflict. Only dependency: `npm install three`.
 *
 * Usage:
 *   <Home onLand={() => navigate("/dashboard")} />
 *
 * Click on the button: the rocket accelerates, the stars rush past, then
 * `onLand` is called after LAUNCH_MS.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./Home.css";

// All visible text lives here, easy to translate.
const COPY = {
  title: "Where should we land?",
  subtitle:
    "Compare landing sites and dates near the Moon's south pole. " +
    "See when the Sun and the Earth are above the horizon: that tells you " +
    "when you have power and a direct link home.",
  button: "Land on the Moon",
  launching: "Launching…",
  credit: "Uses NASA JPL Horizons and LRO LOLA data.",
};

const LAUNCH_MS = 1100;
const STAR_COUNT = 2600;
const FIELD = { x: 48, y: 30, zNear: 0, zFar: -34 }; // size of the star box
const HEADING = 0.52; // rocket tilt (rad), the stars flow the opposite way
const DIR_X = -Math.sin(HEADING);
const DIR_Y = -Math.cos(HEADING);
const MOON_RADIUS = 9;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function createStarTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildStars() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const speeds = new Float32Array(STAR_COUNT); // far stars move slower: parallax
  const tints = [
    [1, 1, 1],
    [0.75, 0.85, 1],
    [1, 0.92, 0.8],
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    const k = i * 3;
    const z = FIELD.zFar + Math.random() * (FIELD.zNear - FIELD.zFar);
    const depth = (z - FIELD.zFar) / (FIELD.zNear - FIELD.zFar); // 0 far .. 1 near
    positions[k] = (Math.random() * 2 - 1) * FIELD.x;
    positions[k + 1] = (Math.random() * 2 - 1) * FIELD.y;
    positions[k + 2] = z;
    speeds[i] = 0.15 + depth * 0.9;

    const tint = tints[Math.floor(Math.random() * tints.length)];
    const b = 0.45 + Math.random() * 0.55;
    colors[k] = tint[0] * b;
    colors[k + 1] = tint[1] * b;
    colors[k + 2] = tint[2] * b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    map: createStarTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  return { points, speeds };
}

function createMoonTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#9b9ba1";
  ctx.fillRect(0, 0, c.width, c.height);

  // Wide, soft dark areas (maria)
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 60 + Math.random() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(60,60,70,0.35)");
    g.addColorStop(1, "rgba(60,60,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Craters: dark floor, bright rim
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 3 + Math.pow(Math.random(), 3) * 46;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, "rgba(70,70,78,0.55)");
    g.addColorStop(0.85, "rgba(90,90,98,0.35)");
    g.addColorStop(1, "rgba(235,235,240,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildMoon() {
  const geometry = new THREE.SphereGeometry(MOON_RADIUS, 96, 64);
  const material = new THREE.MeshStandardMaterial({
    map: createMoonTexture(),
    roughness: 1,
    metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
}

function buildRocket() {
  const root = new THREE.Group(); // tilt + position
  const spin = new THREE.Group(); // rotation around its own axis
  root.add(spin);

  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.35, metalness: 0.25 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.4, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x7fd6ff,
    emissive: 0x2a8fc4,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.2,
  });

  // Body, nose, stripe
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 48), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.85, 48), red);
  nose.position.y = 0.8 + 0.425;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.455, 0.12, 48), red);
  stripe.position.y = -0.3;
  spin.add(body, nose, stripe);

  // Porthole
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 16, 32), dark);
  ring.position.set(0, 0.3, 0.45);
  const pane = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), glass);
  pane.scale.set(1, 1, 0.35);
  pane.position.set(0, 0.3, 0.44);
  spin.add(ring, pane);

  // Three fins
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.45);
  shape.lineTo(0.6, -0.15);
  shape.lineTo(0.6, -0.55);
  shape.lineTo(0, -0.25);
  shape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  finGeometry.translate(0, 0, -0.035);
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i * Math.PI * 2) / 3;
    const fin = new THREE.Mesh(finGeometry, red);
    fin.position.set(0.4, -0.5, 0);
    holder.add(fin);
    spin.add(holder);
  }

  // Engine nozzle
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.28, 32), dark);
  nozzle.position.y = -0.94;
  spin.add(nozzle);

  // Flame: pivot at the nozzle exit, so scaling it keeps the top in place
  const flame = new THREE.Group();
  flame.position.y = -1.08;
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 1.1, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  outer.rotation.x = Math.PI; // apex pointing down
  outer.position.y = -0.55;
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.7, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  core.rotation.x = Math.PI;
  core.position.y = -0.35;
  flame.add(outer, core);
  root.add(flame);

  const light = new THREE.PointLight(0xff8a3c, 10, 8, 2);
  light.position.set(0, -1.5, 0);
  root.add(light);

  root.rotation.z = -HEADING;
  return { root, spin, flame, light };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Home({ onLand }) {
  const mountRef = useRef(null);
  const boostRef = useRef(0); // 0 = cruising, 1 = launch
  const timerRef = useRef(0);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const calm = reduce ? 0 : 1; // multiplies every ambient motion

    // WebGL can fail (old device, blocked GPU): the page still works without it.
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-6, 8, 6);
    scene.add(sun);

    // Objects
    const { points: stars, speeds } = buildStars();
    const moon = buildMoon();
    const rocket = buildRocket();
    scene.add(stars, moon, rocket.root);

    // Layout depends on the viewport (rocket right on wide screens, above the text on mobile)
    const layout = { baseX: 0, baseY: 0 };
    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      const halfW = halfH * camera.aspect;
      const wide = w >= 900;

      layout.baseX = wide ? halfW * 0.42 : 0;
      layout.baseY = wide ? 0.1 : halfH * 0.36;
      rocket.root.scale.setScalar(wide ? 1 : 0.75);
      moon.position.set(0, -halfH * 0.82 - MOON_RADIUS, -2);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pointer parallax (smoothed)
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointerMove = (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointerMove);

    // Animation loop
    const positions = stars.geometry.attributes.position;
    const arr = positions.array;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let boost = 0;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      boost += (boostRef.current - boost) * Math.min(1, dt * 3);
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);

      // Stars flow opposite to the rocket heading; wrap around the box
      const v = calm * (1.4 + boost * 26) * dt;
      for (let i = 0; i < STAR_COUNT; i++) {
        const k = i * 3;
        const s = speeds[i] * v;
        arr[k] += DIR_X * s;
        arr[k + 1] += DIR_Y * s;
        if (arr[k + 1] < -FIELD.y) {
          arr[k + 1] = FIELD.y;
          arr[k] = (Math.random() * 2 - 1) * FIELD.x;
        } else if (arr[k] < -FIELD.x) {
          arr[k] = FIELD.x;
          arr[k + 1] = (Math.random() * 2 - 1) * FIELD.y;
        }
      }
      positions.needsUpdate = true;

      // Rocket: float, spin on its axis, sway with the pointer, rise on launch
      rocket.spin.rotation.y += dt * 0.6 * calm;
      rocket.root.position.set(
        layout.baseX,
        layout.baseY + Math.sin(t * 1.1) * 0.12 * calm + boost * 3.2,
        0
      );
      rocket.root.rotation.z = -HEADING - pointer.x * 0.08;

      // Flame flicker, stronger during launch
      const flick = 1 + Math.sin(t * 38) * 0.08 + Math.sin(t * 23 + 1) * 0.06;
      rocket.flame.scale.set(
        1 + Math.sin(t * 31) * 0.05,
        flick * (1 + boost * 1.4),
        1 + Math.sin(t * 27) * 0.05
      );
      rocket.light.intensity = (9 + Math.sin(t * 40) * 1.5) * (1 + boost);

      moon.rotation.y += dt * 0.01 * calm;

      // Camera parallax
      camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.04;
      camera.position.y += (pointer.y * 0.3 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    // Cleanup (also runs twice in React StrictMode in development)
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleLand = () => {
    if (launching) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      onLand?.();
      return;
    }
    setLaunching(true);
    boostRef.current = 1;
    timerRef.current = window.setTimeout(() => onLand?.(), LAUNCH_MS);
  };

  return (
    <main className="home">
      <div className="home__canvas" ref={mountRef} aria-hidden="true" />

      <div className="home__content">
        <h1 className="home__title">{COPY.title}</h1>
        <p className="home__subtitle">{COPY.subtitle}</p>
        <button
          type="button"
          className="home__cta"
          onClick={handleLand}
          aria-disabled={launching}
          aria-busy={launching}
        >
          {launching ? COPY.launching : COPY.button}
        </button>
      </div>

      <p className="home__credit">{COPY.credit}</p>
    </main>
  );
}
