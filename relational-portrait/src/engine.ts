import * as THREE from "three";
import type {
  Artwork,
  BodyPosition,
  Layer,
  LayerId,
  Plan,
  Signals,
} from "./types";
import { DEFAULT_SIGNALS } from "./types";
import { createAssets, OCEAN_ASSET } from "./assets";
export function sampleSignals(frames: Artwork["frames"], t: number): Signals {
  if (!frames.length) return { ...DEFAULT_SIGNALS };
  let a = frames[0],
    b = a;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= t) a = frames[i];
    else {
      b = frames[i];
      break;
    }
    b = a;
  }
  const f =
    b.t === a.t ? 0 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  return Object.fromEntries(
    Object.keys(a.signals).map((k) => [
      k,
      THREE.MathUtils.lerp(
        a.signals[k as keyof Signals],
        b.signals[k as keyof Signals],
        f,
      ),
    ]),
  ) as unknown as Signals;
}
export function sampleBodies(
  frames: Artwork["frames"],
  t: number,
): BodyPosition[] {
  let a = frames[0],
    b = a;
  if (!a) return [];
  for (const f of frames) {
    if (f.t <= t) a = b = f;
    else {
      b = f;
      break;
    }
  }
  const start = a.bodies || [],
    end = b.bodies || [];
  const amount =
    b.t === a.t || start.length !== end.length
      ? 0
      : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  return start.map((p, i) => ({
    x: THREE.MathUtils.lerp(p.x, end[i]?.x ?? p.x, amount),
    y: THREE.MathUtils.lerp(p.y, end[i]?.y ?? p.y, amount),
  }));
}
export class PortraitEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  groups = new Map<LayerId, THREE.Group>();
  planes = new Map<LayerId, THREE.Mesh>();
  textures = new Map<string, THREE.Texture>();
  fishes: THREE.Mesh[] = [];
  traces: THREE.Line[] = [];
  futureGroup = new THREE.Group();
  futurePlane: THREE.Mesh;
  futureArch: THREE.Mesh;
  work: Artwork | null = null;
  time = 0;
  running = true;
  replaying = false;
  replayEnd = 0;
  signals = { ...DEFAULT_SIGNALS };
  smooth = { ...DEFAULT_SIGNALS };
  private bodies: BodyPosition[] = [];
  private bodyOffsets: BodyPosition[] = [];
  private raf = 0;
  private last = 0;
  private disposed = false;
  private assetKeys = new Map<string, string>();
  private observer: ResizeObserver;
  private onFrame: (t: number, e: number) => void;
  private generation = 0;
  constructor(
    public host: HTMLElement,
    onFrame: (t: number, e: number) => void,
  ) {
    this.onFrame = onFrame;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#eaf0f6");
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Live 2.5D relational portrait",
    );
    this.camera.position.set(0, 0, 12);
    for (const id of [
      "background",
      "architecture",
      "water",
      "objects",
      "connections",
    ] as LayerId[]) {
      const g = new THREE.Group();
      this.groups.set(id, g);
      this.scene.add(g);
    }
    for (const id of [
      "background",
      "architecture",
      "water",
      "connections",
    ] as LayerId[]) {
      const geometry = new THREE.PlaneGeometry(
        id === "background" ? 25 : 10,
        id === "background" ? 14.0625 : 7,
        id === "water" ? 36 : 1,
        id === "water" ? 24 : 1,
      );
      let mat: THREE.Material;
      if (id === "water")
        mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            map: { value: null },
            time: { value: 0 },
            evolution: { value: 0 },
            opacity: { value: 0.95 },
          },
          vertexShader: `varying vec2 vUv; uniform float time; uniform float evolution; void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*1.7+time*.7)*.035+cos(p.x*2.-time*.4)*.025;p.x*=1.+evolution*.14;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
          fragmentShader:
            `varying vec2 vUv;uniform sampler2D map;uniform float opacity;void main(){vec4 c=texture2D(map,vUv);gl_FragColor=vec4(c.rgb,c.a*opacity);#include <colorspace_fragment>}`.replace(
              ";#include",
              ";\n#include",
            ),
        });
      else
        mat = new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
        });
      const mesh = new THREE.Mesh(geometry, mat);
      this.groups.get(id)!.add(mesh);
      this.planes.set(id, mesh);
    }
    this.planes.get("background")!.renderOrder = -10;
    this.futurePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 9, 20, 10),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.futurePlane.position.set(1.5, 0.3, -2.8);
    this.futureArch = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4.2),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.futureArch.position.set(4, 1, -2);
    this.futureGroup.add(this.futurePlane, this.futureArch);
    this.scene.add(this.futureGroup);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }
  private resize() {
    const w = this.host.clientWidth;
    if (w) this.renderer.setSize(w, (w * 9) / 16, false);
  }
  private texture(url: string) {
    let t = this.textures.get(url);
    if (!t) {
      t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, t);
    }
    return t;
  }
  private applyMap(id: LayerId, url: string) {
    if (this.assetKeys.get(id) === url) return;
    this.assetKeys.set(id, url);
    const mesh = this.planes.get(id);
    if (mesh) {
      if (mesh.material instanceof THREE.ShaderMaterial)
        mesh.material.uniforms.map.value = this.texture(url);
      else (mesh.material as THREE.MeshBasicMaterial).map = this.texture(url);
      (mesh.material as THREE.Material).needsUpdate = true;
    }
    if (id === "objects")
      for (const fish of this.fishes) {
        (fish.material as THREE.MeshBasicMaterial).map = this.texture(url);
        (fish.material as THREE.Material).needsUpdate = true;
      }
  }
  configure(work: Artwork) {
    const reset =
      !this.work ||
      this.work.plan.seed !== work.plan.seed ||
      this.work.participants.length !== work.participants.length;
    this.work = work;
    const assets = createAssets(work.plan);
    if (reset) {
      this.assetKeys.delete("objects");
      this.generation++;
      this.fishes.forEach((f) => {
        f.geometry.dispose();
        (f.material as THREE.Material).dispose();
        f.removeFromParent();
      });
      this.fishes = [];
      this.traces.forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
        l.removeFromParent();
      });
      this.traces = [];
      const perGroup = work.plan.object === "fish" ? 4 : 1;
      for (let i = 0; i < work.participants.length * perGroup; i++) {
        const fish = new THREE.Mesh(
          new THREE.PlaneGeometry(0.88, 0.59),
          new THREE.MeshBasicMaterial({
            map: this.texture(assets.objects),
            transparent: true,
            depthWrite: false,
          }),
        );
        this.groups.get("objects")!.add(fish);
        this.fishes.push(fish);
      }
      for (let i = 0; i < work.participants.length * 2; i++) {
        const g = new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 64 }, () => new THREE.Vector3()),
        );
        const line = new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: i % 2 ? "#7083c9" : "#759eb8",
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
          }),
        );
        this.groups.get("connections")!.add(line);
        this.traces.push(line);
      }
    }
    for (const layer of work.layers)
      this.applyMap(layer.id, layer.custom || assets[layer.id]);
    (this.futurePlane.material as THREE.MeshBasicMaterial).map = this.texture(
      work.futurePlan?.environment === "ocean"
        ? OCEAN_ASSET
        : createAssets(work.futurePlan || work.plan).water,
    );
    (this.futureArch.material as THREE.MeshBasicMaterial).map = this.texture(
      createAssets(work.futurePlan || work.plan).architecture,
    );
    (this.futurePlane.material as THREE.Material).needsUpdate = true;
    (this.futureArch.material as THREE.Material).needsUpdate = true;
  }
  setSignals(value: Signals) {
    this.signals = { ...value };
  }
  setBodies(bodies: BodyPosition[]) {
    this.bodies = bodies.map(({ x, y }) => ({ x, y }));
  }
  seek(t: number) {
    this.time = Math.max(0, t);
    this.smooth = sampleSignals(this.work?.frames || [], this.time);
    this.draw(0);
  }
  replay(duration: number) {
    this.replaying = true;
    this.replayEnd = duration;
    this.time = 0;
    this.smooth = sampleSignals(this.work?.frames || [], 0);
    this.running = true;
  }
  live() {
    this.replaying = false;
    this.running = true;
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.25) : 0;
    this.last = now;
    if (this.running) this.time += dt;
    if (this.replaying && this.time >= this.replayEnd) {
      this.time = this.replayEnd;
      this.running = false;
    }
    this.draw(dt);
    this.raf = requestAnimationFrame(this.tick);
  };
  private draw(dt: number) {
    const work = this.work;
    if (!work) return;
    const target = this.replaying
      ? sampleSignals(work.frames, this.time)
      : this.signals;
    for (const key of Object.keys(this.smooth) as (keyof Signals)[])
      this.smooth[key] = THREE.MathUtils.lerp(
        this.smooth[key],
        target[key],
        dt ? 1 - Math.exp(-dt * 4) : 1,
      );
    const s = this.smooth,
      t = this.time;
    const evolution =
      work.futureAt == null
        ? 0
        : THREE.MathUtils.smoothstep(t, work.futureAt, work.futureAt + 12);
    const reveal = THREE.MathUtils.smoothstep(t, 0, 2.5);
    for (const layer of work.layers) {
      const g = this.groups.get(layer.id)!;
      g.visible = layer.visible;
      g.position.set(
        layer.x +
          (layer.id === "architecture" ? -1.5 : layer.id === "water" ? 0.7 : 0),
        layer.y +
          (layer.id === "architecture"
            ? 0.6
            : layer.id === "water"
              ? -0.75
              : 0),
        layer.z,
      );
      g.scale.setScalar(layer.scale);
      if (layer.id === "architecture") {
        g.position.y += Math.sin(t * 0.23) * 0.1;
        g.rotation.z = Math.sin(t * 0.13) * 0.018;
        g.position.x += Math.sin(t * 0.17) * 0.08 - (1 - s.proximity) * 0.4;
      }
      const plane = this.planes.get(layer.id);
      const alpha = layer.opacity * (layer.id === "background" ? 1 : reveal);
      if (plane) {
        if (plane.material instanceof THREE.ShaderMaterial) {
          plane.material.uniforms.time.value = t;
          plane.material.uniforms.evolution.value = evolution;
          plane.material.uniforms.opacity.value = alpha;
        } else
          (plane.material as THREE.MeshBasicMaterial).opacity =
            alpha * (layer.id === "connections" && !layer.custom ? 0.14 : 1);
      }
    }
    const objects = work.layers.find((l) => l.id === "objects")!,
      connections = work.layers.find((l) => l.id === "connections")!;
    const count = work.participants.length,
      perGroup = work.plan.object === "fish" ? 4 : 1;
    const bodies = this.replaying ? sampleBodies(work.frames, t) : this.bodies;
    this.bodyOffsets = work.participants.map((_, i) => {
      const p = bodies[i],
        previous = this.bodyOffsets[i] || { x: 0, y: 0 };
      const amount = dt ? 1 - Math.exp(-dt * 7) : 1;
      return {
        x: THREE.MathUtils.lerp(previous.x, p ? (p.x - 0.5) * 3.8 : 0, amount),
        y: THREE.MathUtils.lerp(previous.y, p ? (0.55 - p.y) * 3 : 0, amount),
      };
    });
    this.fishes.forEach((fish, i) => {
      const person = Math.floor(i / perGroup),
        n = i % perGroup;
      const angle =
        count === 2
          ? person === 0
            ? Math.PI
            : 0
          : (person * Math.PI * 2) / count;
      const spread = (1 - s.proximity) * 3.3 + 0.35;
      const phase =
        (1 - s.synchrony) * person * 1.7 +
        n * 0.68 +
        (work.plan.seed % 997) / 997;
      const tt = t * (0.33 + s.synchrony * 0.1) + phase;
      const x =
        Math.cos(angle) * spread +
        Math.cos(tt) * (0.8 + n * 0.08) +
        evolution * 2.2;
      const y =
        -0.9 +
        Math.sin(angle) * 0.65 +
        Math.sin(tt * 1.4) * 0.22 +
        s.hands * 1.65 +
        evolution * 0.45 +
        n * 0.16;
      fish.position.set(
        x + this.bodyOffsets[person].x,
        y + this.bodyOffsets[person].y,
        Math.sin(tt) * 0.3,
      );
      fish.rotation.z = Math.sin(tt * 0.9) * 0.13;
      const size =
        (0.62 + n * 0.15) * (work.plan.object === "memento" ? 1.4 : 1);
      fish.scale.set((Math.sin(tt) > 0 ? 1 : -1) * size, size, 1);
      (fish.material as THREE.MeshBasicMaterial).opacity =
        objects.opacity * reveal;
      (fish.material as THREE.MeshBasicMaterial).color.setHSL(
        0.61 + s.expression * 0.06,
        0.08 + s.expression * 0.12,
        0.97 - s.expression * 0.03,
      );
    });
    this.traces.forEach((line, i) => {
      line.visible = !connections.custom;
      const person = Math.floor(i / 2),
        branch = i % 2;
      const angle =
        count === 2
          ? person === 0
            ? Math.PI
            : 0
          : (person * Math.PI * 2) / count;
      const separation = (1 - s.proximity) * 4 + 0.35;
      const array = line.geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < 64; j++) {
        const u = j / 63;
        const wave =
          Math.sin(u * Math.PI * 2 + t * 0.3 + (1 - s.synchrony) * person) *
          0.36;
        array[j * 3] =
          Math.cos(angle) * separation * (1 - u * (0.15 + 0.85 * s.proximity)) +
          Math.sin(u * Math.PI) * (branch ? -0.6 : 0.6) +
          evolution * u * 2.8 +
          this.bodyOffsets[person].x * (1 - u * 0.5);
        array[j * 3 + 1] =
          -1.35 +
          u * 1.8 +
          wave +
          branch * 0.18 +
          (1 - s.proximity) * Math.sin(u * Math.PI) * person * 0.24 +
          this.bodyOffsets[person].y * (1 - u * 0.5);
        array[j * 3 + 2] = Math.sin(u * Math.PI) * 0.35;
      }
      line.geometry.attributes.position.needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity =
        connections.opacity * 0.55 * reveal;
    });
    (this.futurePlane.material as THREE.MeshBasicMaterial).opacity =
      evolution * 0.78;
    this.futurePlane.scale.set(1 + evolution * 0.15, 1, 1);
    (this.futureArch.material as THREE.MeshBasicMaterial).opacity =
      evolution * 0.8;
    this.futureArch.position.x = 4.1 - evolution * 0.4;
    this.futureArch.position.y = 1 + Math.sin(t * 0.16) * 0.08;
    this.futureGroup.visible = !!work.futurePlan;
    const water = this.groups.get("water")!;
    water.position.y += Math.sin(t * 0.35) * 0.035;
    water.scale.x *= 1 + evolution * 0.18;
    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      Math.sin(t * 0.12) * 0.13,
      0.035,
    );
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      Math.cos(t * 0.1) * 0.07,
      0.035,
    );
    this.camera.lookAt(0, 0, 0);
    this.renderer.setClearColor(
      new THREE.Color("#eaf0f6").lerp(
        new THREE.Color("#e8e0f2"),
        s.expression * 0.25,
      ),
    );
    this.renderer.render(this.scene, this.camera);
    this.onFrame(t, evolution);
  }
  async png(): Promise<Blob> {
    const size = this.renderer.getSize(new THREE.Vector2()),
      ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(1600, 900, false);
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob>((resolve, reject) =>
      this.renderer.domElement.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
        "image/png",
      ),
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(size.x, size.y, false);
    return blob;
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const m = o.material;
        Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
      }
    });
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
