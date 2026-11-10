import { DEFAULT_LAYERS, DEFAULT_PARTICIPANTS, DEFAULT_SIGNALS } from "./types";
import type {
  Artwork,
  BodyPosition,
  Frame,
  Layer,
  Participant,
  Signals,
} from "./types";
import { planFromTags } from "./services/creative";
export function appendFrame(
  frames: Frame[],
  sceneTime: number,
  signals: Signals,
  source: Frame["source"],
  bodies: BodyPosition[] = [],
): Frame[] {
  // Several input events can arrive before the next rendered frame. Preserve
  // each action instead of overwriting events that share the same scene time.
  const t = Math.max(sceneTime, (frames.at(-1)?.t ?? -0.001) + 0.001);
  return [
    ...frames,
    {
      t,
      signals: { ...signals },
      source,
      bodies: bodies.map(({ x, y }) => ({ x, y })),
    },
  ];
}
export function newWork(): Artwork {
  return {
    format: "relational-portrait",
    version: 1,
    title: "Where the water remembers",
    participants: structuredClone(DEFAULT_PARTICIPANTS),
    layers: structuredClone(DEFAULT_LAYERS),
    plan: planFromTags(DEFAULT_PARTICIPANTS.flatMap((p) => p.memoryTags)),
    futurePlan: null,
    futureAt: null,
    frames: [{ t: 0, signals: { ...DEFAULT_SIGNALS }, source: "manual" }],
    duration: 0,
    createdAt: new Date().toISOString(),
  };
}
export function validateWork(data: unknown): Artwork {
  const w = data as Artwork;
  const fail = () => {
    throw new Error(
      "This is not a valid Relational Portrait file. Your current work is unchanged.",
    );
  };
  if (
    !w ||
    typeof w.title !== "string" ||
    w.title.length > 200 ||
    typeof w.createdAt !== "string" ||
    w.format !== "relational-portrait" ||
    w.version !== 1 ||
    !Array.isArray(w.participants) ||
    !w.participants.length ||
    w.participants.length > 100 ||
    !Array.isArray(w.layers) ||
    w.layers.length !== 5 ||
    !Array.isArray(w.frames) ||
    w.frames.length > 20000
  )
    fail();
  const ids = new Set();
  for (const p of w.participants) {
    if (
      !p ||
      typeof p.id !== "string" ||
      p.id.length > 100 ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      typeof p.memory !== "string" ||
      typeof p.future !== "string" ||
      p.memory.length > 10000 ||
      p.future.length > 10000 ||
      p.name.length > 80 ||
      !Array.isArray(p.memoryTags) ||
      !Array.isArray(p.futureTags) ||
      p.memoryTags.length > 40 ||
      p.futureTags.length > 40 ||
      [...p.memoryTags, ...p.futureTags].some(
        (t) => typeof t !== "string" || t.length > 80,
      )
    )
      fail();
    ids.add(p.id);
  }
  const layerIds = new Set();
  for (const l of w.layers) {
    if (
      !l ||
      !DEFAULT_LAYERS.some((d) => d.id === l.id) ||
      layerIds.has(l.id) ||
      typeof l.name !== "string" ||
      l.name.length > 80 ||
      ![l.x, l.y, l.z, l.scale, l.opacity].every(Number.isFinite) ||
      Math.abs(l.x) > 10 ||
      Math.abs(l.y) > 6 ||
      Math.abs(l.z) > 6 ||
      l.scale < 0.2 ||
      l.scale > 3 ||
      l.opacity < 0 ||
      l.opacity > 1 ||
      typeof l.visible !== "boolean" ||
      (l.custom &&
        (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(l.custom) ||
          l.custom.length > 6000000))
    )
      fail();
    layerIds.add(l.id);
  }
  let previous = -1;
  for (const f of w.frames) {
    if (
      f?.bodies !== undefined &&
      (!Array.isArray(f.bodies) ||
        f.bodies.length > 100 ||
        f.bodies.some(
          (p) =>
            !p ||
            ![p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
        ))
    )
      fail();
    if (
      !f ||
      !["manual", "camera"].includes(f.source) ||
      !Number.isFinite(f.t) ||
      f.t < previous ||
      !f.signals ||
      !["proximity", "synchrony", "hands", "expression"].every(
        (k) =>
          Number.isFinite(f.signals[k as keyof typeof f.signals]) &&
          f.signals[k as keyof typeof f.signals] >= 0 &&
          f.signals[k as keyof typeof f.signals] <= 1,
      )
    )
      fail();
    previous = f.t;
  }
  if (
    !Number.isFinite(w.duration) ||
    w.duration < 0 ||
    w.duration > 86400 ||
    previous > w.duration ||
    (w.futureAt != null && (!Number.isFinite(w.futureAt) || w.futureAt < 0)) ||
    !w.plan ||
    !Array.isArray(w.plan.tags) ||
    w.plan.tags.some((t) => typeof t !== "string") ||
    (w.futurePlan &&
      (!Array.isArray(w.futurePlan.tags) ||
        w.futurePlan.tags.some((t) => typeof t !== "string")))
  )
    fail();
  return {
    ...structuredClone(w),
    plan: planFromTags(w.plan.tags),
    futurePlan: w.futurePlan ? planFromTags(w.futurePlan.tags, "future") : null,
  };
}
export function replaceParticipant(
  people: Participant[],
  id: string,
  patch: Partial<Participant>,
) {
  return people.map((p) => (p.id === id ? { ...p, ...patch } : p));
}
export function patchLayer(
  layers: Layer[],
  id: Layer["id"],
  patch: Partial<Layer>,
) {
  return layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
