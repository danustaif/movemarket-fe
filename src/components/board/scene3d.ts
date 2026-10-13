// Scene three.js papan 3D, port dari source/design/prototype/board3d.method.js (r149) ke three r186:
// outputColorSpace sRGB adalah default, texture.colorSpace menggantikan encoding, dan intensitas lampu
// dikali PI karena mode lampu lama (physicallyCorrectLights = false) sudah dihapus.
// Papan hanya tampilan: drag memutar kamera, pinch/ctrl+scroll memperbesar, tap/hover memilih petak.
import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, type BufferGeometry, CanvasTexture, CylinderGeometry, DirectionalLight, DoubleSide,
  ExtrudeGeometry, Group, HemisphereLight, LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters, type Object3D, PCFShadowMap, PerspectiveCamera, Plane, PlaneGeometry,
  PMREMGenerator, Raycaster, Scene, Shape, ShadowMaterial, SphereGeometry, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer,
} from "three";
import { pieceMap } from "./lastMove.ts";

export interface SceneOptions {
  /** Jarak kamera; default menurut rasio aspek kanvas. */
  dist?: number;
  /** Geser proyeksi (fraksi lebar/tinggi) untuk kanvas lebar (aspek >= 1.3) dan sempit. */
  offset?: [number, number];
  offsetNarrow?: [number, number];
  elev?: number;
  angle?: number;
  /** Rasio aspek minimum yang masih memuat papan utuh; kanvas lebih sempit menjauhkan kamera supaya papan tidak terpotong. */
  fit?: number;
  /** Tanpa ayunan otomatis, tween, dan inersia (prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** Petak di bawah penunjuk (hover mouse atau tap), null saat keluar papan. Koordinat relatif kanvas. */
  onPick?(square: string | null, x: number, y: number): void;
}

export interface BoardScene {
  /** Ganti posisi. `move` disorot sampai posisi berikutnya; `animate` menggerakkan bidak (ply berurutan). */
  setPosition(fen: string, move: { from: string; to: string } | undefined, animate: boolean): void;
  /** Putar kamera (tombol panah). */
  nudge(dAngle: number, dElev: number): void;
  reset(): void;
  dispose(): void;
}

const FILES = "abcdefgh";
const LIGHT_SCALE = Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampElev = (e: number) => clamp(e, 0.22, 1.35);
const clampZoom = (z: number) => clamp(z, 0.7, 1.45);
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/** Lempar error kalau WebGL gagal dibuat; pemanggil jatuh ke papan 2D. */
export function createBoardScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): BoardScene {
  const reduce = !!opts.reducedMotion;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  // Lingkungan pantulan: ruang teal redup dengan dua softbox.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  envScene.add(new Mesh(new BoxGeometry(24, 12, 24), new MeshBasicMaterial({ color: 0x0f2f2b, side: BackSide })));
  const panel = (w: number, h: number, rgb: [number, number, number], pos: [number, number, number], rot: [number, number, number]) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ side: DoubleSide }));
    m.material.color.setRGB(...rgb);
    m.position.set(...pos);
    m.rotation.set(...rot);
    envScene.add(m);
  };
  panel(10, 6, [2.2, 2.05, 1.8], [-4, 5.9, 3], [Math.PI / 2, 0, 0]);
  panel(6, 4, [0.35, 1.1, 0.95], [11.9, 3, -4], [0, -Math.PI / 2, 0]);
  panel(5, 3, [1.4, 1.1, 0.6], [-11.9, 2, 5], [0, Math.PI / 2, 0]);
  const envTex = pmrem.fromScene(envScene, 0.035).texture;
  scene.environment = envTex;
  envScene.traverse((o) => {
    if (o instanceof Mesh) { o.geometry.dispose(); (o.material as MeshBasicMaterial).dispose(); }
  });

  scene.add(new HemisphereLight(0xd9efe9, 0x0d3a35, 0.25 * LIGHT_SCALE));
  const key = new DirectionalLight(0xffe6bd, 2.1 * LIGHT_SCALE);
  key.position.set(-5, 11, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new DirectionalLight(0x86e0cf, 0.8 * LIGHT_SCALE);
  rim.position.set(7, 4, -8);
  scene.add(rim);

  const root = new Group();
  scene.add(root);
  const floor = new Mesh(keep(new PlaneGeometry(60, 60)), keep(new ShadowMaterial({ opacity: 0.34 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.64;
  floor.receiveShadow = true;
  scene.add(floor);

  const phys = (color: number, roughness: number, o: MeshPhysicalMaterialParameters = {}) =>
    keep(new MeshPhysicalMaterial({ color, roughness, envMapIntensity: 0.8, ...o }));
  const rrect = (w: number, h: number, r: number) => {
    const s = new Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  const flatExtrude = (shape: Shape, depth: number, bevel: number, segs = 3) => {
    const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 12 });
    g.rotateX(-Math.PI / 2);
    return keep(g);
  };
  const add = (o: Object3D, y: number, shadow: { cast?: boolean; receive?: boolean } = {}) => {
    o.position.y = y;
    o.castShadow = !!shadow.cast;
    o.receiveShadow = !!shadow.receive;
    root.add(o);
  };

  // Papan: alas, bingkai lacquer dengan inlay emas, petak berbevel.
  add(new Mesh(flatExtrude(rrect(10.3, 10.3, 0.3), 0.1, 0.03), phys(0x041613, 0.7, { envMapIntensity: 0.3 })), -0.6, { cast: true, receive: true });
  const frameShape = rrect(9.9, 9.9, 0.22);
  frameShape.holes.push(rrect(8.2, 8.2, 0.02));
  add(new Mesh(flatExtrude(frameShape, 0.5, 0.06, 4), phys(0x0b3a33, 0.34, { clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.55 })), -0.48, { cast: true, receive: true });
  add(new Mesh(keep(new BoxGeometry(8.24, 0.5, 8.24)), phys(0x041a17, 0.8)), -0.26, { receive: true });
  const inlayShape = rrect(8.72, 8.72, 0.06);
  inlayShape.holes.push(rrect(8.56, 8.56, 0.04));
  add(new Mesh(flatExtrude(inlayShape, 0.012, 0), phys(0xd6b04f, 0.28, { metalness: 0.85 })), 0.082);

  // Sorotan langkah terakhir memakai token DESIGN.md board-last-light / board-last-dark.
  const sq = { clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.4 };
  const mats = {
    l: phys(0xe2dfc2, 0.6, sq), d: phys(0x2f6e5e, 0.55, sq),
    hl: phys(0xf5f08a, 0.5, sq), hd: phys(0xb8c95c, 0.5, sq),
  };
  const sqGeo = flatExtrude(rrect(0.96, 0.96, 0.03), 0.05, 0.018, 2);
  const squares = new Map<string, Mesh>();
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const dark = (f + r) % 2 === 0;
      const m = new Mesh(sqGeo, dark ? mats.d : mats.l);
      m.position.set(f - 3.5, 0, 3.5 - r);
      m.receiveShadow = true;
      m.userData.dark = dark;
      root.add(m);
      squares.set(`${FILES[f]}${r + 1}`, m);
    }
  }
  const labelTex = (txt: string) => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#b8d3ce"; g.font = "700 40px Archivo, Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 32, 34);
    }
    const t = keep(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const labelGeo = keep(new PlaneGeometry(0.32, 0.32));
  for (let i = 0; i < 8; i++) {
    const fm = new Mesh(labelGeo, keep(new MeshBasicMaterial({ map: labelTex(FILES[i]!), transparent: true })));
    fm.rotation.x = -Math.PI / 2; fm.position.set(i - 3.5, 0.09, 4.58); root.add(fm);
    const rm = new Mesh(labelGeo, keep(new MeshBasicMaterial({ map: labelTex(String(i + 1)), transparent: true })));
    rm.rotation.x = -Math.PI / 2; rm.position.set(-4.58, 0.09, 3.5 - i); root.add(rm);
  }

  // Bidak: profil bubut dengan kerah dan mahkota, kuda dipahat.
  const V = (pts: number[][]) => pts.map(([x, y]) => new Vector2(x, y));
  const ball = (cy: number, r: number, from: number) => {
    const out: number[][] = [];
    for (let a = from; a <= 90; a += 10) out.push([r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]);
    return out;
  };
  const base = [[0, 0], [0.35, 0], [0.36, 0.015], [0.36, 0.06], [0.34, 0.085], [0.3, 0.1], [0.3, 0.125], [0.27, 0.15], [0.24, 0.175], [0.21, 0.2]];
  const profiles: Record<string, number[][]> = {
    p: [...base, [0.17, 0.24], [0.13, 0.32], [0.11, 0.4], [0.18, 0.43], [0.19, 0.455], [0.17, 0.475], [0.1, 0.49], ...ball(0.6, 0.14, -50)],
    r: [...base, [0.2, 0.28], [0.19, 0.5], [0.2, 0.56], [0.25, 0.6], [0.27, 0.63], [0.27, 0.66], [0.25, 0.68], [0.27, 0.7], [0.27, 0.8], [0.19, 0.8], [0.19, 0.74], [0, 0.74]],
    b: [...base, [0.16, 0.3], [0.12, 0.46], [0.1, 0.58], [0.2, 0.62], [0.21, 0.645], [0.19, 0.665], [0.11, 0.68], [0.14, 0.74], [0.18, 0.84], [0.175, 0.93], [0.14, 1.0], [0.08, 1.06], [0.04, 1.09], ...ball(1.135, 0.05, -40)],
    q: [...base, [0.17, 0.3], [0.13, 0.5], [0.11, 0.7], [0.23, 0.74], [0.24, 0.765], [0.22, 0.785], [0.12, 0.8], [0.14, 0.9], [0.2, 1.0], [0.25, 1.05], [0.25, 1.085], [0.19, 1.08], [0.1, 1.1], [0.06, 1.14], ...ball(1.19, 0.06, -40)],
    k: [...base, [0.17, 0.32], [0.13, 0.55], [0.11, 0.74], [0.24, 0.78], [0.25, 0.805], [0.23, 0.825], [0.12, 0.84], [0.15, 0.96], [0.21, 1.08], [0.23, 1.11], [0.23, 1.14], [0.16, 1.15], [0.08, 1.17], [0, 1.175]],
    n: [...base, [0.23, 0.22], [0.25, 0.24], [0.25, 0.28], [0, 0.28]],
  };
  const geos = Object.fromEntries(Object.entries(profiles).map(([k, p]) => [k, keep(new LatheGeometry(V(p), 48))]));
  const head = new Shape();
  head.moveTo(-0.2, 0.26); head.lineTo(0.15, 0.26);
  head.quadraticCurveTo(0.11, 0.42, 0.24, 0.5);
  head.quadraticCurveTo(0.38, 0.56, 0.42, 0.62);
  head.quadraticCurveTo(0.46, 0.68, 0.4, 0.73);
  head.quadraticCurveTo(0.3, 0.77, 0.2, 0.78);
  head.quadraticCurveTo(0.16, 0.9, 0.09, 0.97);
  head.lineTo(0.07, 1.06); head.lineTo(0.0, 1.0);
  head.quadraticCurveTo(-0.16, 0.93, -0.22, 0.74);
  head.quadraticCurveTo(-0.29, 0.5, -0.2, 0.26);
  const headGeo = keep(new ExtrudeGeometry(head, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 5, curveSegments: 18 }));
  headGeo.translate(0, 0, -0.1);
  const mane = new Shape();
  mane.moveTo(-0.02, 0.98); mane.quadraticCurveTo(-0.2, 0.92, -0.26, 0.7); mane.quadraticCurveTo(-0.3, 0.5, -0.24, 0.3);
  mane.lineTo(-0.2, 0.3); mane.quadraticCurveTo(-0.25, 0.52, -0.2, 0.72); mane.quadraticCurveTo(-0.14, 0.88, 0.0, 0.95);
  const maneGeo = keep(new ExtrudeGeometry(mane, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 14 }));
  maneGeo.translate(-0.01, 0, -0.05);
  const eyeGeo = keep(new SphereGeometry(0.024, 12, 8));
  const cross = new Shape();
  [[-0.035, 0], [0.035, 0], [0.035, 0.11], [0.1, 0.11], [0.1, 0.165], [0.035, 0.165], [0.035, 0.26], [-0.035, 0.26], [-0.035, 0.165], [-0.1, 0.165], [-0.1, 0.11], [-0.035, 0.11]]
    .forEach(([x, y], i) => (i ? cross.lineTo(x!, y!) : cross.moveTo(x!, y!)));
  const crossGeo = keep(new ExtrudeGeometry(cross, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 }));
  crossGeo.translate(0, 1.16, -0.025);
  const merlonGeo = keep(new BoxGeometry(0.12, 0.1, 0.1));
  const pearlGeo = keep(new SphereGeometry(0.036, 12, 8));
  const slitGeo = keep(new BoxGeometry(0.03, 0.2, 0.3));
  const feltGeo = keep(new CylinderGeometry(0.335, 0.335, 0.012, 40));
  const pMat = {
    w: phys(0xe9e2d2, 0.34, { clearcoat: 0.6, clearcoatRoughness: 0.22, envMapIntensity: 0.7 }),
    b: phys(0x1a201f, 0.22, { metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.12 }),
  };
  const darkMat = phys(0x0a0d0c, 0.5);
  const feltMat = phys(0x0f3a33, 1);
  const PIECE_SCALE = 0.86;

  const makePiece = (ch: string) => {
    const color = ch === ch.toUpperCase() ? "w" : "b";
    const t = ch.toLowerCase();
    const g = new Group();
    const part = (geo: BufferGeometry, mat = pMat[color]) => {
      const m = new Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    part(geos[t]!);
    const felt = part(feltGeo, feltMat);
    felt.position.y = -0.004;
    felt.castShadow = false;
    if (t === "n") {
      const face = color === "w" ? Math.PI / 2 : -Math.PI / 2;
      part(headGeo).rotation.y = face;
      part(maneGeo).rotation.y = face;
      for (const sd of [-1, 1]) {
        const e = part(eyeGeo, darkMat);
        const lx = 0.2, lz = sd * 0.15;
        e.position.set(Math.cos(face) * lx + Math.sin(face) * lz, 0.8, -Math.sin(face) * lx + Math.cos(face) * lz);
      }
    }
    if (t === "k") part(crossGeo);
    if (t === "r") {
      for (let i = 0; i < 6; i++) {
        const m = part(merlonGeo);
        const a = (i / 6) * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.23, 0.85, Math.sin(a) * 0.23);
        m.rotation.y = -a;
      }
    }
    if (t === "q") {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        part(pearlGeo).position.set(Math.cos(a) * 0.235, 1.1, Math.sin(a) * 0.235);
      }
    }
    if (t === "b") {
      const s = part(slitGeo, darkMat);
      s.position.set(0.09, 0.92, 0);
      s.rotation.z = -0.6;
      s.scale.set(1, 0.9, 0.55);
      s.castShadow = false;
    }
    g.scale.setScalar(PIECE_SCALE);
    g.userData.type = ch;
    return g;
  };

  const sqPos = (s: string) => new Vector3(FILES.indexOf(s[0]!) - 3.5, 0.075, 3.5 - (Number(s[1]) - 1));
  const pieces = new Map<string, Group>();
  type Tween = { mesh: Group; from: Vector3; to: Vector3; t0: number; dur: number; kind: "move" | "capture" };
  const tweens: Tween[] = [];
  const place = (s: string, ch: string) => {
    const m = makePiece(ch);
    m.position.copy(sqPos(s));
    root.add(m);
    pieces.set(s, m);
  };
  /** Bidak termakan menyusut dan tenggelam, lalu dilepas. */
  const capture = (s: string, animate: boolean) => {
    const m = pieces.get(s);
    if (!m) return;
    pieces.delete(s);
    if (!animate || reduce) { root.remove(m); return; }
    tweens.push({ mesh: m, from: m.position.clone(), to: m.position.clone().setY(-0.3), t0: performance.now(), dur: 420, kind: "capture" });
  };
  const slide = (m: Group, to: Vector3) => {
    if (reduce) { m.position.copy(to); return; }
    tweens.push({ mesh: m, from: m.position.clone(), to, t0: performance.now(), dur: 650, kind: "move" });
  };
  const highlight = (a?: string, b?: string) => {
    for (const [k, s] of squares) {
      const lit = k === a || k === b;
      s.material = s.userData.dark ? (lit ? mats.hd : mats.d) : (lit ? mats.hl : mats.l);
    }
  };

  const setPosition: BoardScene["setPosition"] = (fen, move, animate) => {
    // Tween yang belum selesai langsung diselesaikan supaya posisi baru dimulai dari keadaan bersih.
    for (const tw of tweens.splice(0)) {
      if (tw.kind === "capture") root.remove(tw.mesh);
      else tw.mesh.position.copy(tw.to);
    }
    const next = pieceMap(fen);
    const anim = animate && !reduce;
    if (anim && move && move.from !== move.to && pieces.has(move.from)) {
      const mover = pieces.get(move.from)!;
      pieces.delete(move.from);
      capture(move.to, true);
      pieces.set(move.to, mover);
      slide(mover, sqPos(move.to));
    }
    const gone = [...pieces.keys()].filter((s) => next[s] !== pieces.get(s)!.userData.type);
    const fresh = Object.keys(next).filter((s) => pieces.get(s)?.userData.type !== next[s]);
    // Bidak lain yang ikut pindah (benteng saat rokade) meluncur; sisanya muncul/hilang (en passant, promosi, lompatan ply).
    for (const g of [...gone]) {
      const type = pieces.get(g)!.userData.type as string;
      const i = fresh.findIndex((f) => next[f] === type && !pieces.has(f));
      if (!anim || i < 0) continue;
      const f = fresh.splice(i, 1)[0]!;
      gone.splice(gone.indexOf(g), 1);
      const m = pieces.get(g)!;
      pieces.delete(g);
      pieces.set(f, m);
      slide(m, sqPos(f));
    }
    for (const g of gone) capture(g, anim);
    for (const f of fresh) { capture(f, false); place(f, next[f]!); }
    highlight(move?.from, move?.to);
    dirty = true;
  };

  // ------------------------------------------------------------ kamera dan input
  const baseAng = opts.angle ?? -0.62;
  const baseElev = opts.elev ?? 0.62;
  let ang = baseAng, elev = baseElev, zoom = 1, vel = 0, touched = false, resetT = 0, dirty = true;
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  let pinch: { d: number; zoom: number } | null = null;
  const raycaster = new Raycaster();
  const boardPlane = new Plane(new Vector3(0, 1, 0), -0.075);

  const pick = (clientX: number, clientY: number): string | null => {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects([...pieces.values()], true)[0];
    if (hit) {
      let o: Object3D | null = hit.object;
      while (o && o.parent !== root) o = o.parent;
      for (const [s, m] of pieces) if (m === o) return s;
    }
    const p = raycaster.ray.intersectPlane(boardPlane, new Vector3());
    if (!p) return null;
    const f = Math.round(p.x + 3.5), rk = Math.round(3.5 - p.z);
    return f >= 0 && f < 8 && rk >= 0 && rk < 8 ? `${FILES[f]}${rk + 1}` : null;
  };
  const report = (e: PointerEvent, sqName: string | null) => {
    const r = canvas.getBoundingClientRect();
    opts.onPick?.(sqName, e.clientX - r.left, e.clientY - r.top);
  };
  const pinchDist = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer sudah dilepas */ }
    if (pointers.size === 2) {
      drag = null;
      pinch = { d: pinchDist(), zoom };
      return;
    }
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    vel = 0;
    resetT = 0;
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const d = pinchDist();
      if (pinch.d > 0 && d > 0) { zoom = clampZoom(pinch.zoom * (pinch.d / d)); touched = true; dirty = true; }
      return;
    }
    if (!drag) {
      if (e.pointerType === "mouse") report(e, pick(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    if (!drag.moved) opts.onPick?.(null, 0, 0);
    drag.moved = true;
    touched = true;
    ang -= dx * 0.008;
    vel = reduce ? 0 : -dx * 0.008;
    // Sentuh: gerak vertikal milik scroll halaman (touch-action: pan-y), jadi hanya mouse/pen yang mengubah elevasi.
    if (e.pointerType !== "touch") elev = clampElev(elev + dy * 0.006);
    dirty = true;
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === "pointerup") report(e, pick(e.clientX, e.clientY));
    drag = null;
    canvas.style.cursor = "grab";
  };
  const onLeave = (e: PointerEvent) => { if (e.pointerType === "mouse" && !drag) opts.onPick?.(null, 0, 0); };
  const reset = () => { resetT = performance.now(); vel = 0; dirty = true; };
  const onWheel = (e: WheelEvent) => {
    // Hanya ctrl/cmd + scroll (juga pinch trackpad) supaya scroll halaman tidak terkunci di atas papan.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = clampZoom(zoom * (1 + e.deltaY * 0.004));
    touched = true;
    dirty = true;
  };
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("dblclick", reset);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // ------------------------------------------------------------ loop render
  let w = 0, h = 0, raf = 0, visible = true;
  const t0 = performance.now();
  const resize = () => {
    const parent = canvas.parentElement;
    const nw = Math.max(1, parent?.clientWidth ?? 1), nh = Math.max(1, parent?.clientHeight ?? 1);
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const off = (w / h >= 1.3 ? opts.offset : opts.offsetNarrow) ?? [0, 0];
    camera.setViewOffset(w, h, -w * off[0], -h * off[1], w, h);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const frame = (now: number) => {
    raf = 0;
    resize();
    const aspect = w / h;
    const fit = opts.fit && aspect < opts.fit ? opts.fit / aspect : 1;
    const dist = (opts.dist ?? (aspect < 0.9 ? 24 : aspect < 1.3 ? 19 : 17)) * fit * zoom;
    if (!drag && Math.abs(vel) > 0.0001) { ang += vel; vel *= 0.93; dirty = true; }
    if (resetT) {
      const e = ease(Math.min(1, (now - resetT) / 600));
      ang += (baseAng - ang) * e; elev += (baseElev - elev) * e; zoom += (1 - zoom) * e;
      if (e >= 1) { resetT = 0; touched = false; }
      dirty = true;
    }
    // Ayunan pelan saat belum disentuh (dimatikan untuk reduced motion).
    if (!touched && !reduce) { ang = baseAng + Math.sin(((now - t0) / 1000) * 0.12) * 0.07; dirty = true; }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]!;
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      const e = ease(k);
      if (tw.kind === "move") {
        // Diangkat, melengkung ke petak tujuan, lalu turun.
        tw.mesh.position.lerpVectors(tw.from, tw.to, e);
        tw.mesh.position.y = tw.to.y + Math.sin(Math.PI * k) * 0.7;
      } else {
        tw.mesh.position.lerpVectors(tw.from, tw.to, e);
        tw.mesh.scale.setScalar(PIECE_SCALE * (1 - e));
      }
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.kind === "capture") root.remove(tw.mesh);
        else tw.mesh.position.copy(tw.to);
      }
      dirty = true;
    }
    if (dirty) {
      camera.position.set(Math.sin(ang) * dist * Math.cos(elev), dist * Math.sin(elev), Math.cos(ang) * dist * Math.cos(elev));
      camera.lookAt(0.2, -0.4, 0.2);
      renderer.render(scene, camera);
      dirty = false;
    }
    if (visible) raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  // Kanvas di luar layar tidak dirender.
  const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([en]) => {
    visible = !!en?.isIntersecting;
    if (visible) start();
  });
  io?.observe(canvas);
  start();

  return {
    setPosition: (fen, move, animate) => { setPosition(fen, move, animate); start(); },
    nudge: (dA, dE) => { ang += dA; elev = clampElev(elev + dE); touched = true; dirty = true; start(); },
    reset: () => { reset(); start(); },
    dispose: () => {
      visible = false;
      cancelAnimationFrame(raf);
      io?.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("dblclick", reset);
      canvas.removeEventListener("wheel", onWheel);
      disposables.forEach((d) => d.dispose());
      envTex.dispose();
      pmrem.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
