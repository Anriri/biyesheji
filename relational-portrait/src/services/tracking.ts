import type {
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { Signals } from "../types";
export interface BodySample {
  x: number;
  y: number;
  raised: number;
}
export interface TrackedBody extends BodySample {
  id: string;
  vx: number;
  vy: number;
  at: number;
}
export interface TrackingUpdate {
  bodies: TrackedBody[];
  signals: Signals;
  count: number;
  fps: number;
}
export interface ExpressionSource {
  read(): number;
} // Future Face Landmarker adapter; no affect/psychological labels.
export class ManualExpression implements ExpressionSource {
  value = 0.35;
  read() {
    return this.value;
  }
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function poseSample(landmarks: NormalizedLandmark[]): BodySample | null {
  const torso = [11, 12]
    .map((i) => landmarks[i])
    .filter((p) => p && (p.visibility ?? 1) > 0.45);
  // A laptop camera often sees shoulders but not hips. Keep this real pose
  // instead of discarding seated participants after successful inference.
  if (torso.length < 2) return null;
  const x = 1 - torso.reduce((s, p) => s + p.x, 0) / torso.length,
    y = torso.reduce((s, p) => s + p.y, 0) / torso.length;
  let raised = 0;
  for (const [s, w] of [
    [11, 15],
    [12, 16],
  ]) {
    const a = landmarks[s],
      b = landmarks[w];
    if (a && b && (b.visibility ?? 1) > 0.5)
      raised = Math.max(raised, clamp((a.y - b.y - 0.035) / 0.22));
  }
  return { x: clamp(x), y: clamp(y), raised };
}
export function matchBodies(
  previous: TrackedBody[],
  samples: BodySample[],
  at: number,
): TrackedBody[] {
  const fresh = previous.filter((p) => at - p.at < 700),
    unused = new Set(samples.map((_, i) => i)),
    out: TrackedBody[] = [];
  const pairs = fresh
    .flatMap((p) =>
      samples.map((s, i) => ({ p, i, d: Math.hypot(p.x - s.x, p.y - s.y) })),
    )
    .sort((a, b) => a.d - b.d);
  const matched = new Set<string>();
  for (const { p, i, d } of pairs) {
    if (d > 0.5 || !unused.has(i) || matched.has(p.id)) continue;
    unused.delete(i);
    matched.add(p.id);
    const s = samples[i],
      dt = Math.max(0.03, (at - p.at) / 1000);
    out.push({
      ...s,
      id: p.id,
      x: p.x * 0.5 + s.x * 0.5,
      y: p.y * 0.5 + s.y * 0.5,
      vx: (s.x - p.x) / dt,
      vy: (s.y - p.y) / dt,
      at,
    });
  }
  const taken = new Set(out.map((p) => p.id));
  let n = 0;
  for (const i of [...unused].sort((a, b) => samples[a].x - samples[b].x)) {
    while (taken.has(`body-${n}`)) n++;
    const id = `body-${n++}`;
    taken.add(id);
    out.push({ ...samples[i], id, vx: 0, vy: 0, at });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
export function motionSignals(
  bodies: TrackedBody[],
  expression: number,
): Signals {
  if (bodies.length < 2)
    return {
      proximity: 0.35,
      synchrony: 0,
      hands: bodies[0]?.raised || 0,
      expression,
    };
  let distance = 0,
    synchrony = 0,
    pairs = 0;
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i],
        b = bodies[j];
      distance += Math.hypot(a.x - b.x, (a.y - b.y) * 0.5);
      const as = Math.hypot(a.vx, a.vy),
        bs = Math.hypot(b.vx, b.vy);
      synchrony +=
        as > 0.025 && bs > 0.025
          ? Math.max(0, (a.vx * b.vx + a.vy * b.vy) / (as * bs)) *
            clamp(Math.min(as, bs) * 5)
          : 0;
      pairs++;
    }
  return {
    proximity: 1 - clamp((distance / pairs - 0.08) / 0.68),
    synchrony: synchrony / pairs,
    hands: bodies.reduce((s, b) => s + b.raised, 0) / bodies.length,
    expression,
  };
}
export class PoseController {
  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private token = 0;
  private bodies: TrackedBody[] = [];
  private abort: AbortController | null = null;
  expression: ExpressionSource = new ManualExpression();
  async start(
    video: HTMLVideoElement,
    onUpdate: (u: TrackingUpdate) => void,
    onStatus: (s: string) => void,
  ) {
    this.stop(video);
    const token = ++this.token;
    try {
      if (!window.isSecureContext)
        throw new Error(
          "Camera requires HTTPS or localhost. Manual interaction is ready.",
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera API unavailable. Manual interaction is ready.");
      onStatus("Requesting camera permission…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      if (token !== this.token) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      video.srcObject = stream;
      await video.play();
      if (token !== this.token) return;
      onStatus("Loading local pose model…");
      const { FilesetResolver, PoseLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      this.abort = new AbortController();
      const timer = setTimeout(() => this.abort?.abort(), 15000);
      let model: ArrayBuffer;
      try {
        const response = await fetch(
          new URL("models/pose_landmarker_lite.task", document.baseURI),
          { signal: this.abort.signal },
        );
        if (!response.ok)
          throw new Error(
            "Pose model missing. Use manual controls or restore public/models.",
          );
        model = await response.arrayBuffer();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", model)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (
          hash !==
          "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"
        )
          throw new Error(
            "Local pose model failed integrity check. Restore the model; manual controls remain available.",
          );
      } finally {
        clearTimeout(timer);
      }
      const files = await FilesetResolver.forVisionTasks(
        new URL("vision/wasm", document.baseURI).href,
      );
      const detector = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetBuffer: new Uint8Array(model),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputSegmentationMasks: false,
      });
      if (token !== this.token) {
        detector.close();
        return;
      }
      this.landmarker = detector;
      onStatus("Camera active · keep both shoulders in view.");
      let last = 0,
        lastVideo = -1;
      const frame = (now: number) => {
        if (token !== this.token || !this.landmarker) return;
        try {
          if (
            now - last > 90 &&
            video.readyState >= 2 &&
            video.currentTime !== lastVideo
          ) {
            const dt = last ? now - last : 100;
            last = now;
            lastVideo = video.currentTime;
            const result = this.landmarker.detectForVideo(video, now),
              samples = result.landmarks
                .map(poseSample)
                .filter((s): s is BodySample => s !== null);
            this.bodies = matchBodies(this.bodies, samples, now);
            onUpdate({
              bodies: this.bodies,
              signals: motionSignals(this.bodies, this.expression.read()),
              count: samples.length,
              fps: 1000 / dt,
            });
          }
          this.raf = requestAnimationFrame(frame);
        } catch (error) {
          onStatus(
            `Tracking stopped: ${error instanceof Error ? error.message : "model error"}. Manual controls are ready.`,
          );
          this.stop(video);
        }
      };
      this.raf = requestAnimationFrame(frame);
    } catch (error) {
      if (token !== this.token) return;
      this.stop(video);
      const e = error as Error;
      throw new Error(
        e.name === "NotAllowedError"
          ? "Camera permission denied. Continue with manual controls."
          : e.name === "NotFoundError"
            ? "No camera found. Continue with manual controls."
            : e.name === "AbortError"
              ? "Model loading timed out. Continue with manual controls."
              : e.message,
      );
    }
  }
  stop(video?: HTMLVideoElement) {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.abort?.abort();
    this.abort = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.bodies = [];
    if (video) video.srcObject = null;
  }
}
