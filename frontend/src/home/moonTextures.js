import * as THREE from "three";

// Procedural Moon surface (no image files needed): fractal noise + maria + ~2000 craters.
// Replace later with NASA LRO / CGI Moon Kit images (see HomeScene.jsx: /tex/moon_color.jpg, /tex/moon_bump.jpg).
const W = 1024, H = 512;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function noise2(seed) {
  const r = rng(seed), g = new Float32Array(256 * 256);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y & 255) << 8) | (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function drawCrater(ctx, x, y, rad, sx, stops) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1); // compensate equirectangular stretching toward the poles
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad * 1.4);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const BUMP = [[0, "rgba(45,45,45,.95)"], [0.55, "rgba(75,75,75,.9)"], [0.69, "rgba(235,235,235,.95)"], [0.76, "rgba(170,170,170,.6)"], [1, "rgba(128,128,128,0)"]];
const SHADE = [[0, "rgba(0,0,0,.18)"], [0.6, "rgba(0,0,0,.10)"], [0.7, "rgba(255,255,255,.14)"], [1, "rgba(255,255,255,0)"]];

export function makeMoonTextures() {
  const n = noise2(7), n2 = noise2(99);
  const mk = () => Object.assign(document.createElement("canvas"), { width: W, height: H });
  const colorC = mk(), bumpC = mk();
  const cc = colorC.getContext("2d"), bc = bumpC.getContext("2d");
  const ci = cc.createImageData(W, H), bi = bc.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let f = 0, a = 0.5, tot = 0;
      for (let k = 0; k < 5; k++) { f += a * n(u * 8 * 2 ** k, v * 4 * 2 ** k); tot += a; a *= 0.5; }
      f /= tot;
      const mare = smooth(0.46, 0.56, n2(u * 4, v * 2) * 0.6 + n(u * 8, v * 4) * 0.4);
      const albedo = (0.62 + (f - 0.5) * 0.5) * (1 - 0.42 * mare);
      const h = 0.5 + (f - 0.5) * (0.5 - 0.35 * mare);
      const i = (y * W + x) * 4;
      ci.data[i] = albedo * 255; ci.data[i + 1] = albedo * 247; ci.data[i + 2] = albedo * 235; ci.data[i + 3] = 255;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = h * 255; bi.data[i + 3] = 255;
    }
  }
  cc.putImageData(ci, 0, 0);
  bc.putImageData(bi, 0, 0);

  const r = rng(2026), craters = [];
  for (let i = 0; i < 2200; i++) craters.push({ x: r() * W, y: r() * H, rad: 2 + 70 * Math.pow(r(), 4.5) });
  craters.sort((p, q) => q.rad - p.rad); // big first, small ones overprint

  for (const c of craters) {
    const lat = (0.5 - c.y / H) * Math.PI;
    const sx = 1 / Math.max(0.25, Math.cos(lat));
    for (const dx of [-W, 0, W]) { // wrap around the seam
      const x = c.x + dx;
      if (x + c.rad * sx * 1.4 < 0 || x - c.rad * sx * 1.4 > W) continue;
      drawCrater(bc, x, c.y, c.rad, sx, BUMP);
      drawCrater(cc, x, c.y, c.rad, sx, SHADE);
    }
  }

  const map = new THREE.CanvasTexture(colorC);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpC);
  [map, bump].forEach((t) => { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; });
  return { map, bump };
}
