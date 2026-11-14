import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles, useTexture } from "@react-three/drei";

const R = 6; // Moon radius
const MOON_Y = -7.2; // top of the limb sits at y = -1.2: we look at the Moon from orbit
const lerp = THREE.MathUtils.lerp;

/* ---------- Dense starfield with a Milky Way band (no twinkle: no atmosphere) ---------- */
function Stars({ count = 12000 }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const group = useRef();
  const { geo, uniforms } = useMemo(() => {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const size = new Float32Array(count), alpha = new Float32Array(count);
    const tilt = new THREE.Vector3(0.3, 1, 0.2).normalize();
    const u = new THREE.Vector3().crossVectors(tilt, new THREE.Vector3(0, 0, 1)).normalize();
    const w = new THREE.Vector3().crossVectors(tilt, u);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.35) {
        const a = Math.random() * Math.PI * 2;
        const off = (Math.random() + Math.random() + Math.random() - 1.5) * 0.28;
        v.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(tilt, off).normalize();
      } else {
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.lengthSq() > 1 || v.lengthSq() < 0.01) { i--; continue; }
        v.normalize();
      }
      v.multiplyScalar(140).toArray(pos, i * 3);
      const m = Math.pow(Math.random(), 7);
      size[i] = 0.7 + m * 3.6;
      alpha[i] = 0.2 + m * 0.8 + Math.random() * 0.15;
      const t = Math.random();
      col[i * 3] = lerp(0.72, 1, t); col[i * 3 + 1] = lerp(0.82, 0.86, t); col[i * 3 + 2] = lerp(1, 0.72, t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
    return { geo: g, uniforms: { uPR: { value: dpr } } };
  }, [count, dpr]);

  useFrame((_, dt) => { group.current.rotation.y += dt * 0.0012; });
  return (
    <group ref={group}>
      <points geometry={geo} frustumCulled={false}>
        <shaderMaterial args={[{
          uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
          vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uPR;
            void main(){ vC=color; vA=alpha; gl_PointSize=size*uPR; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `varying vec3 vC; varying float vA;
            void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC, smoothstep(.5,.0,d)*vA); }`,
        }]} />
      </points>
    </group>
  );
}

/* ---------- Deep-sky sprites: nebula, galaxy, bright blue star (procedural shaders) ---------- */
const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const NOISE = `
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }`;

const NEBULA = `varying vec2 vUv; uniform float uTime; uniform vec3 uA; uniform vec3 uB; ${NOISE}
void main(){
  vec2 p=(vUv-.5)*2.; float r=length(p);
  vec2 q=vec2(fbm(p*2.+uTime*.01), fbm(p*2.+5.2-uTime*.008));
  float d=fbm(p*3.+q*2.2);
  float dens=smoothstep(.34,.86,d)*smoothstep(1.,.12,r);
  vec3 c=mix(uA,uB,fbm(p*4.+q));
  gl_FragColor=vec4(c*dens*1.4, dens*.9);
}`;

const GALAXY = `varying vec2 vUv; ${NOISE}
void main(){
  vec2 p=(vUv-.5)*2.; p=mat2(.8,.6,-.6,.8)*p; p.y*=3.2;
  float r=length(p), th=atan(p.y,p.x);
  float core=exp(-r*9.);
  float arms=pow(.5+.5*cos(2.*th-log(r+.02)*4.5),2.)*exp(-r*2.4)*(.6+.4*fbm(p*6.));
  vec3 col=vec3(1.,.72,.45)*core*1.6+vec3(.75,.8,1.)*arms*.65;
  float a=clamp(core+arms*.6,0.,1.)*smoothstep(1.,.5,length((vUv-.5)*2.));
  gl_FragColor=vec4(col,a);
}`;

const BLUESTAR = `varying vec2 vUv;
void main(){
  vec2 p=(vUv-.5)*2.; float r=length(p);
  float core=exp(-r*38.), halo=exp(-r*7.)*.35;
  float sp=(exp(-abs(p.x)*60.)*exp(-abs(p.y)*4.)+exp(-abs(p.y)*60.)*exp(-abs(p.x)*4.))*.6;
  vec3 col=vec3(.45,.65,1.)*(halo+sp)+vec3(.9,.95,1.)*core;
  gl_FragColor=vec4(col, clamp(core+halo+sp,0.,1.));
}`;

function Sprite({ position, size, frag, uniforms = {}, animate = false }) {
  const u = useMemo(() => ({ uTime: { value: 0 }, ...uniforms }), []); // eslint-disable-line
  useFrame(({ clock }) => { if (animate) u.uTime.value = clock.elapsedTime; });
  return (
    <mesh position={position}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial args={[{ uniforms: u, vertexShader: VERT, fragmentShader: frag, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending }]} />
    </mesh>
  );
}

function DeepSky() {
  return (
    <>
      <Sprite position={[-30, 14, -80]} size={64} frag={NEBULA} animate
        uniforms={{ uA: { value: new THREE.Color(0.85, 0.12, 0.22) }, uB: { value: new THREE.Color(0.55, 0.3, 0.55) } }} />
      <Sprite position={[34, 19, -90]} size={16} frag={BLUESTAR} />
      <Sprite position={[30, -9, -85]} size={17} frag={GALAXY} />
    </>
  );
}

/* ---------- Moon: hard terminator, no atmosphere, bump-mapped craters ---------- */
function Moon({ scroll }) {
  const mesh = useRef();
  const [color, normal, elevation] = useTexture([
    "/tex/moon_color.jpg",
    "/tex/moon_normal.png",
    "/tex/moon_elevation.jpg",
  ]);
  color.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  elevation.colorSpace = THREE.NoColorSpace;

  useFrame(({ clock }) => { mesh.current.rotation.y = clock.elapsedTime * 0.01 + scroll.current * 0.8; });
  return (
    <mesh ref={mesh} position={[0, MOON_Y, 0]} castShadow receiveShadow>
      <sphereGeometry args={[R, 192, 192]} />
      <meshStandardMaterial
        map={color}
        normalMap={normal}
        normalScale={[0.58, 0.58]}
        bumpMap={elevation}
        bumpScale={0.075}
        displacementMap={elevation}
        displacementScale={0.045}
        color="#b4b4b4"
        roughness={0.97}
        metalness={0}
      />
    </mesh>
  );
}

/* ---------- Camera: slow intro from far away, mouse parallax, scroll drift, landing dive ---------- */
function Rig({ scroll, landing }) {
  const { camera, pointer } = useThree();
  const land = useRef(0);
  const tgt = useMemo(() => new THREE.Vector3(), []);
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useFrame(({ clock }, dt) => {
    const t = reduce ? 99 : clock.elapsedTime;
    const intro = 1 - Math.pow(1 - Math.min(t / 6, 1), 3);
    const s = scroll.current;
    if (landing) land.current = Math.min(1, land.current + dt / 2.4);
    const L = land.current * land.current * (3 - 2 * land.current);

    tgt.set(
      lerp(pointer.x * 0.35, 0.2, L),
      lerp(0.35 - s * 3.0 + pointer.y * 0.15, -0.9, L),
      lerp(lerp(17, 9, intro) - s * 2.0, 2.2, L)
    );
    camera.position.lerp(tgt, 1 - Math.exp(-4 * dt));
    camera.lookAt(0, lerp(-1.4 - s * 1.5, -3, L), lerp(0, -2.5, L));
    camera.fov = lerp(40, 70, L);
    camera.updateProjectionMatrix();
  });
  return null;
}

export default function HomeScene({ scroll, landing }) {
  return (
    <>
      <color attach="background" args={["#000"]} />
      <ambientLight intensity={0.012} color="#b7c8e8" />
      {/* Sun: low and from the side, so the limb is lit with long crater shadows */}
      <directionalLight castShadow position={[-9, 2.5, 1.5]} intensity={3.8} color="#fff6ea" />
      {/* Earthshine: very faint cool fill on the dark side */}
      <directionalLight position={[8, -2, 6]} intensity={0.06} color="#8fb4ff" />
      <Sparkles count={140} scale={[55, 34, 45]} size={1.4} speed={0.12} opacity={0.5} color="#cfe4ff" />
      <Stars />
      <DeepSky />
      <Moon scroll={scroll} />
      <Rig scroll={scroll} landing={landing} />
    </>
  );
}
