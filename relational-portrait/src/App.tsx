import { useEffect, useRef, useState } from "react";
import type {
  Artwork,
  BodyPosition,
  Layer,
  Participant,
  Phase,
  Signals,
} from "./types";
import { DEFAULT_SIGNALS } from "./types";
import {
  newWork,
  patchLayer,
  replaceParticipant,
  download,
  appendFrame,
} from "./work";
import { localCreativeService } from "./services/creative";
import { PoseController, ManualExpression } from "./services/tracking";
import type { TrackingUpdate } from "./services/tracking";
import { PortraitEngine } from "./engine";
const steps: Phase[] = ["memory", "portrait", "interaction", "future", "final"];
const stepNames = [
  "Memory input",
  "Initial portrait",
  "Live interaction",
  "Future input",
  "Final portrait",
];
const captions = [
  "Your memory",
  "Your portrait",
  "Move together",
  "Your future",
  "Your portrait",
];
const shortSteps = ["Memory", "Portrait", "Live", "Future", "Export"];
function Arrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 13 13 3M3 3h10v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  unit?: string;
}) {
  return (
    <label className="range">
      <span>
        {{
          "Distance between participants": "Distance",
          "Movement synchrony": "Synchrony",
          "Expression input (manual)": "Expression · manual",
          "Expression input (camera)": "Expression · camera",
        }[label] || label}
        <output>
          {unit === "%" ? Math.round(value * 100) + "%" : value.toFixed(2)}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Tags({
  tags,
  onChange,
  disabled = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="tags-editor">
      <div className="chips">
        {tags.map((tag, i) => (
          <span className="chip" key={i}>
            <input
              disabled={disabled}
              aria-label={`Edit motif ${i + 1}`}
              value={tag}
              style={{ width: `${Math.max(4, Math.min(19, tag.length))}ch` }}
              onChange={(e) =>
                onChange(
                  tags.map((t, j) =>
                    i === j ? e.target.value.slice(0, 40) : t,
                  ),
                )
              }
            />
            <button
              disabled={disabled}
              title={`Remove ${tag}`}
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((_, j) => i !== j))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="tag-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) {
            onChange([...tags, draft.trim().slice(0, 40)]);
            setDraft("");
          }
        }}
      >
        <input
          disabled={disabled}
          aria-label="New motif"
          placeholder="Add your own motif"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button disabled={disabled} aria-label="Add motif" type="submit">
          +
        </button>
      </form>
    </div>
  );
}
export default function App() {
  const [work, setWork] = useState<Artwork>(newWork),
    [phase, setPhase] = useState<Phase>("memory"),
    [generated, setGenerated] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [fatal, setFatal] = useState("");
  const [signals, setSignals] = useState<Signals>({ ...DEFAULT_SIGNALS }),
    [inputSource, setInputSource] = useState<"manual" | "camera">("manual"),
    [cameraBusy, setCameraBusy] = useState(false),
    [cameraStatus, setCameraStatus] = useState(
      "Camera is off. Manual interaction is ready.",
    ),
    [tracked, setTracked] = useState<TrackingUpdate | null>(null);
  const [clock, setClock] = useState({ time: 0, evolution: 0 }),
    [replay, setReplay] = useState(false),
    [selectedLayer, setSelectedLayer] = useState<Layer["id"]>("architecture");
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<PortraitEngine | null>(null),
    video = useRef<HTMLVideoElement>(null),
    pose = useRef(new PoseController()),
    expression = useRef(new ManualExpression()),
    lastRecord = useRef(-1),
    cameraRequest = useRef(0),
    lastUi = useRef(0),
    signalsRef = useRef(signals),
    generatedRef = useRef(generated),
    workRef = useRef(work);
  workRef.current = work;
  generatedRef.current = generated;
  signalsRef.current = signals;
  useEffect(() => {
    if (!host.current) return;
    try {
      const e = new PortraitEngine(host.current, (time, evolution) => {
        if (performance.now() - lastUi.current > 120) {
          setClock({ time, evolution });
          if (engine.current?.replaying && !engine.current.running) {
            engine.current.live();
            setReplay(false);
          }
          lastUi.current = performance.now();
        }
      });
      engine.current = e;
      e.configure(workRef.current);
      e.time = 12;
    } catch (error) {
      setFatal(
        `WebGL could not start: ${error instanceof Error ? error.message : "unknown error"}. Try a browser with WebGL 2 enabled.`,
      );
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.configure(work);
  }, [work]);
  useEffect(() => {
    engine.current?.setSignals(signals);
    expression.current.value = signals.expression;
  }, [signals]);
  useEffect(() => () => pose.current.stop(video.current || undefined), []);
  const updatePerson = (id: string, patch: Partial<Participant>) =>
    setWork((w) => ({
      ...w,
      participants: replaceParticipant(w.participants, id, patch),
    }));
  function record(
    value: Signals,
    source: "manual" | "camera",
    bodies: BodyPosition[] = [],
  ) {
    setSignals(value);
    engine.current?.setBodies(bodies);
    if (!generatedRef.current || engine.current?.replaying) return;
    const t = engine.current?.time || 0;
    if (source === "camera" && t - lastRecord.current < 0.5) return;
    lastRecord.current = t;
    setWork((w) => {
      const frames = appendFrame(w.frames, t, value, source, bodies);
      return {
        ...w,
        duration: Math.max(w.duration, frames.at(-1)!.t),
        frames,
      };
    });
  }
  async function findMotifs(which: "memory" | "future") {
    setBusy(true);
    try {
      const proposals = await localCreativeService.extract(
        work.participants,
        which,
      );
      setWork((w) => ({
        ...w,
        participants: w.participants.map((p) => ({
          ...p,
          [which === "memory" ? "memoryTags" : "futureTags"]:
            proposals.find((x) => x.id === p.id)?.tags || [],
        })),
      }));
      setNotice("Motifs ready.");
    } catch {
      setNotice("Could not interpret these words. Add your own motifs below.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    try {
      const plan = await localCreativeService.compose(
        work.participants.flatMap((p) => p.memoryTags),
        "memory",
      );
      const next = {
        ...work,
        plan,
        futurePlan: null,
        futureAt: null,
        frames: [{ t: 0, signals: { ...signals }, source: "manual" as const }],
        duration: 0,
        title:
          plan.environment === "ocean"
            ? "The distance becomes a tide"
            : plan.environment === "pond"
              ? "Where the water remembers"
              : "A place between our days",
      };
      setWork(next);
      setGenerated(true);
      setPhase("portrait");
      setClock({ time: 0, evolution: 0 });
      setReplay(false);

      lastRecord.current = -1;
      if (engine.current) {
        engine.current.configure(next);
        engine.current.live();
        engine.current.seek(0);
      }
      setNotice("Portrait generated.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function evolve() {
    setBusy(true);
    try {
      const futurePlan = await localCreativeService.compose(
        work.participants.flatMap((p) => p.futureTags),
        "future",
      );
      const t = engine.current?.time || 0;
      setWork((w) => ({
        ...w,
        futurePlan,
        futureAt: t,
        duration: Math.max(w.duration, t + 12),
      }));
      setNotice("Growing.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startCamera() {
    if (!video.current) return;
    const request = ++cameraRequest.current;
    setCameraBusy(true);
    pose.current.expression = expression.current;
    try {
      await pose.current.start(
        video.current,
        (u) => {
          setTracked(u);
          setInputSource("camera");
          record(u.signals, "camera", u.bodies);
        },
        (s) => {
          setCameraStatus(s);
          if (s.startsWith("Tracking stopped")) {
            setInputSource("manual");
            setTracked(null);
            engine.current?.setBodies([]);
          }
        },
      );
      if (request === cameraRequest.current) setInputSource("camera");
    } catch (error) {
      if (request !== cameraRequest.current) return;
      setInputSource("manual");
      setCameraStatus((error as Error).message);
      setTracked(null);
    } finally {
      if (request === cameraRequest.current) setCameraBusy(false);
    }
  }
  function stopCamera() {
    cameraRequest.current++;
    pose.current.stop(video.current || undefined);
    setInputSource("manual");
    setCameraBusy(false);
    setTracked(null);
    engine.current?.setBodies([]);
    setCameraStatus("Camera is off. Manual controls are active.");
  }
  function manual(key: keyof Signals, value: number) {
    record({ ...signalsRef.current, [key]: value }, "manual");
  }
  async function upload(layer: Layer, file: File | undefined) {
    if (!file) return;
    try {
      if (file.type !== "image/png" || file.size > 4 * 1024 * 1024)
        throw new Error(
          "Choose a PNG under 4 MB. Transparent backgrounds are supported.",
        );
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      if (image.width > 4096 || image.height > 4096)
        throw new Error("Please use a PNG no larger than 4096 × 4096.");
      setWork((w) => ({
        ...w,
        layers: patchLayer(w.layers, layer.id, { custom: data }),
      }));
      setNotice(`${layer.name} replaced.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  const currentSnapshot = () => ({
    ...workRef.current,
    duration: Math.max(
      workRef.current.duration,
      engine.current?.time || 0,
      workRef.current.futureAt == null ? 0 : workRef.current.futureAt + 12,
    ),
  });
  function replayJourney() {
    stopCamera();
    const current = currentSnapshot();
    setWork(current);
    engine.current?.replay(current.duration);
    setClock({ time: 0, evolution: 0 });
    setReplay(true);

    setNotice("Playing.");
  }
  function returnLive() {
    if (engine.current) {
      engine.current.live();
      engine.current.seek(work.duration);
    }
    setReplay(false);
  }
  async function exportPNG() {
    try {
      if (!engine.current) throw new Error("The renderer is not available.");
      download(await engine.current.png(), "relational-portrait.png");
      setNotice("PNG saved.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function exportText() {
    const text = work.participants
      .map(
        (p) =>
          `${p.name}\nMEMORY\n${p.memory}\nMOTIFS: ${p.memoryTags.join(", ")}\n\nFUTURE\n${p.future}\nMOTIFS: ${p.futureTags.join(", ")}`,
      )
      .join("\n\n———\n\n");
    download(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      "relational-memories.txt",
    );
  }
  const active = steps.indexOf(phase),
    layer = work.layers.find((l) => l.id === selectedLayer)!;
  const validMemory = work.participants.every(
      (p) => p.memory.trim() && p.memoryTags.some((t) => t.trim()),
    ),
    validFuture = work.participants.every(
      (p) => p.future.trim() && p.futureTags.some((t) => t.trim()),
    );
  function peopleInputs(which: "memory" | "future") {
    return (
      <div className="people-inputs">
        {work.participants.map((p, i) => (
          <section className="person-card" key={p.id}>
            <div className="person-label">
              <span className={`person-dot dot-${i % 3}`} />
              <span>{p.name}</span>
            </div>
            <textarea
              readOnly={which === "future" && !!work.futurePlan}
              aria-label={`${p.name} ${which}`}
              value={p[which]}
              placeholder={
                which === "memory"
                  ? "A place, an object, a moment you shared…"
                  : "A place you might go. A world you might make…"
              }
              maxLength={3000}
              onChange={(e) =>
                updatePerson(p.id, {
                  [which]: e.target.value,
                  [which === "memory" ? "memoryTags" : "futureTags"]: [],
                })
              }
            />
            <details className="fold tags-fold">
              <summary>Motifs</summary>
              <Tags
                disabled={which === "future" && !!work.futurePlan}
                tags={p[which === "memory" ? "memoryTags" : "futureTags"]}
                onChange={(tags) =>
                  updatePerson(p.id, {
                    [which === "memory" ? "memoryTags" : "futureTags"]: tags,
                  })
                }
              />
            </details>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <header className="masthead">
        <span className="brand">RELATIONAL PORTRAIT</span>
      </header>
      <nav className="steps" aria-label="Portrait stages">
        {steps.map((step, i) => (
          <button
            key={step}
            aria-label={`${String(i + 1).padStart(2, "0")} ${stepNames[i]}`}
            aria-current={phase === step ? "step" : undefined}
            disabled={(i > 0 && !generated) || (i === 4 && !work.futurePlan)}
            onClick={() => {
              if (replay) returnLive();
              setPhase(step);
            }}
          >
            <b>{String(i + 1).padStart(2, "0")}</b>
            <span>{shortSteps[i]}</span>
          </button>
        ))}
      </nav>
      <main className="workspace">
        <section className="art-column">
          <div className="art-topline">
            <span className="mode-badge">
              <i />
              {replay
                ? "PLAYBACK"
                : !generated
                  ? "STUDIO PREVIEW"
                  : inputSource === "camera"
                    ? "CAMERA"
                    : "MANUAL"}
            </span>
          </div>
          <div className="art-frame">
            <div className="three-host" ref={host} />
            {fatal && (
              <div className="render-error" role="alert">
                {fatal}
              </div>
            )}
          </div>
        </section>
        <aside className="control-panel">
          <h2>{captions[active]}</h2>
          {phase === "memory" && (
            <>
              {peopleInputs("memory")}
              <div className="panel-actions">
                <button
                  aria-label="Find shared motifs"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void findMotifs("memory")}
                >
                  Find motifs
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !validMemory || !!fatal}
                  onClick={() => void generate()}
                >
                  {busy ? "Interpreting…" : "Generate portrait"}{" "}
                  <span>
                    <Arrow />
                  </span>
                </button>
              </div>
            </>
          )}
          {phase === "portrait" && (
            <>
              <details className="fold asset-tools">
                <summary>PNG assets</summary>
                <select
                  aria-label="Asset layer"
                  value={selectedLayer}
                  onChange={(e) =>
                    setSelectedLayer(e.target.value as Layer["id"])
                  }
                >
                  {work.layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <label className="upload-button">
                  Upload PNG
                  <input
                    type="file"
                    accept="image/png"
                    aria-label={`Upload ${layer.name} PNG`}
                    onChange={(e) => {
                      void upload(layer, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </details>
              <button
                aria-label="Enter live interaction"
                className="primary-button"
                onClick={() => setPhase("interaction")}
              >
                Continue{" "}
                <span>
                  <Arrow />
                </span>
              </button>
            </>
          )}
          {phase === "interaction" && (
            <>
              <div className="source-switch">
                <button
                  aria-pressed={inputSource === "manual"}
                  onClick={stopCamera}
                >
                  Manual
                </button>
                <button
                  aria-pressed={inputSource === "camera"}
                  disabled={cameraBusy || replay}
                  onClick={() => void startCamera()}
                >
                  {cameraBusy ? "Loading…" : "Use camera"}
                </button>
              </div>
              <Range
                label="Distance between participants"
                value={1 - signals.proximity}
                unit="%"
                disabled={inputSource === "camera" || replay}
                onChange={(v) => manual("proximity", 1 - v)}
              />
              <Range
                label={
                  inputSource === "camera" &&
                  tracked?.expressionMode === "camera"
                    ? "Expression input (camera)"
                    : "Expression input (manual)"
                }
                value={signals.expression}
                unit="%"
                disabled={
                  replay ||
                  (inputSource === "camera" &&
                    tracked?.expressionMode === "camera")
                }
                onChange={(v) => {
                  expression.current.value = v;
                  record(
                    { ...signalsRef.current, expression: v },
                    inputSource,
                    inputSource === "camera" ? tracked?.bodies || [] : [],
                  );
                }}
              />
              <p className="camera-status" role="status">
                {cameraStatus}
                {inputSource === "camera" && (
                  <>
                    <br />
                    {tracked?.fps.toFixed(0) || 0} FPS ·{" "}
                    {tracked?.count === 2
                      ? "Two body positions detected"
                      : tracked?.count === 1
                        ? "One body tracked; add a second for distance"
                        : "Waiting for bodies"}
                    {tracked?.expressionMode === "camera" && (
                      <>
                        {" "}
                        · {tracked.faceCount} face
                        {tracked.faceCount === 1 ? "" : "s"}
                      </>
                    )}
                  </>
                )}
              </p>
              {(inputSource === "camera" || cameraBusy) && (
                <button className="text-button" onClick={stopCamera}>
                  Stop camera
                </button>
              )}
              <button
                aria-label="Imagine what comes next"
                className="primary-button"
                onClick={() => setPhase("future")}
              >
                Next{" "}
                <span>
                  <Arrow />
                </span>
              </button>
            </>
          )}
          {phase === "future" && (
            <>
              {peopleInputs("future")}
              <button
                aria-label="Find future motifs"
                className="secondary-button"
                disabled={busy || replay || !!work.futurePlan}
                onClick={() => void findMotifs("future")}
              >
                Find motifs
              </button>
              <button
                className="primary-button"
                disabled={busy || !validFuture || replay || !!work.futurePlan}
                onClick={() => void evolve()}
              >
                {work.futurePlan ? "Future chapter added" : "Grow this world"}{" "}
                <span>
                  <Arrow />
                </span>
              </button>
              {work.futurePlan && (
                <>
                  <div className="growth-meter">
                    <span>
                      INTEGRATING NEW FRAGMENTS{" "}
                      <b>{Math.round(clock.evolution * 100)}%</b>
                    </span>
                    <progress max="1" value={clock.evolution} />
                  </div>
                  <button
                    aria-label="View final portrait"
                    className="secondary-button"
                    disabled={clock.evolution < 0.98}
                    onClick={() => setPhase("final")}
                  >
                    View portrait <Arrow />
                  </button>
                </>
              )}
            </>
          )}
          {phase === "final" && (
            <>
              <button
                aria-label="Export final PNG"
                className="primary-button"
                disabled={!!fatal || clock.evolution < 0.98}
                onClick={() => void exportPNG()}
              >
                Save PNG <span>↓</span>
              </button>
              <button
                aria-label="Replay the full journey"
                className="secondary-button"
                onClick={replayJourney}
              >
                Replay <span>↺</span>
              </button>
              <div className="export-row">
                <button
                  onClick={() =>
                    download(
                      new Blob([JSON.stringify(currentSnapshot(), null, 2)], {
                        type: "application/json",
                      }),
                      "relational-portrait.json",
                    )
                  }
                >
                  ↓ Portrait JSON
                </button>
                <button onClick={exportText}>↓ Text & motifs</button>
              </div>
            </>
          )}
          <div className="video-preview" hidden>
            <video
              ref={video}
              muted
              playsInline
              autoPlay
              aria-label="Camera input preview"
            />
          </div>
        </aside>
      </main>
      <div className="notice" role="status">
        {notice}
      </div>
    </div>
  );
}
