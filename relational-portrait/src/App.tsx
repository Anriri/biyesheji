import { useEffect, useRef, useState } from "react";
import type { Artwork, Layer, Participant, Phase, Signals } from "./types";
import { DEFAULT_SIGNALS } from "./types";
import {
  newWork,
  patchLayer,
  replaceParticipant,
  validateWork,
  download,
  appendFrame,
} from "./work";
import { localCreativeService } from "./services/creative";
import { PoseController, ManualExpression } from "./services/tracking";
import type { TrackingUpdate } from "./services/tracking";
import { PortraitEngine, sampleSignals } from "./engine";
import { createAssets } from "./assets";
const steps: Phase[] = ["memory", "portrait", "interaction", "future", "final"];
const stepNames = [
  "Memory input",
  "Initial portrait",
  "Live interaction",
  "Future input",
  "Final portrait",
];
const captions = [
  "What stays between us?",
  "A place made of fragments.",
  "Let the space respond.",
  "What comes after remembering?",
  "A portrait, still becoming.",
];
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
function Flower() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 3v34M3 20h34M8 8l24 24M8 32 32 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
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
        {label}
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
function formatTime(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
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
    [tracked, setTracked] = useState<TrackingUpdate | null>(null),
    [preview, setPreview] = useState(false);
  const [clock, setClock] = useState({ time: 0, evolution: 0 }),
    [playing, setPlaying] = useState(true),
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
    file = useRef<HTMLInputElement>(null),
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
          setPlaying(engine.current?.running ?? true);
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
  function record(value: Signals, source: "manual" | "camera") {
    setSignals(value);
    if (!generatedRef.current || engine.current?.replaying) return;
    const t = engine.current?.time || 0;
    if (source === "camera" && t - lastRecord.current < 0.5) return;
    lastRecord.current = t;
    setWork((w) => {
      const frames = appendFrame(w.frames, t, value, source);
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
      setNotice("Motifs found locally. Edit any word before continuing.");
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
      setPlaying(true);
      lastRecord.current = -1;
      if (engine.current) {
        engine.current.configure(next);
        engine.current.live();
        engine.current.seek(0);
      }
      setNotice("Your first portrait is taking shape.");
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
      setNotice(
        "New fragments are joining the existing world. Nothing is replaced.",
      );
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
          record(
            { ...u.signals, expression: expression.current.value },
            "camera",
          );
        },
        (s) => {
          setCameraStatus(s);
          if (s.startsWith("Tracking stopped")) {
            setInputSource("manual");
            setTracked(null);
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
      setNotice(
        `${layer.name} replaced. Its depth and interaction are preserved.`,
      );
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
    setPlaying(true);
    setNotice(
      "Replaying the recorded input timeline, including the future transition.",
    );
  }
  function returnLive() {
    if (engine.current) {
      engine.current.live();
      engine.current.seek(work.duration);
    }
    setReplay(false);
    setPlaying(true);
  }
  function togglePlay() {
    if (engine.current) {
      if (
        engine.current.replaying &&
        !engine.current.running &&
        engine.current.time >= engine.current.replayEnd
      )
        engine.current.seek(0);
      engine.current.running = !engine.current.running;
      setPlaying(engine.current.running);
    }
  }
  async function exportPNG() {
    try {
      if (!engine.current) throw new Error("The renderer is not available.");
      download(await engine.current.png(), "relational-portrait.png");
      setNotice(
        "PNG exported at 1600 × 900. The interface and camera are excluded.",
      );
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
  async function importWork(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > 30 * 1024 * 1024)
        throw new Error("Choose a JSON file under 30 MB.");
      const w = validateWork(JSON.parse(await f.text()));
      stopCamera();
      setWork(w);
      setSignals(sampleSignals(w.frames, w.duration));
      setGenerated(true);
      setPhase(w.futurePlan ? "final" : "portrait");
      setClock({
        time: w.duration,
        evolution:
          w.futureAt == null
            ? 0
            : Math.min(1, Math.max(0, (w.duration - w.futureAt) / 12)),
      });
      setReplay(true);
      setPlaying(false);
      if (engine.current) {
        engine.current.configure(w);
        engine.current.replay(w.duration);
        engine.current.seek(w.duration);
        engine.current.running = false;
      }
      setNotice("Portrait restored. You can replay its recorded journey.");
    } catch (error) {
      setNotice(
        error instanceof SyntaxError
          ? "Invalid JSON. Your current portrait is unchanged."
          : (error as Error).message,
      );
    }
  }
  const active = steps.indexOf(phase),
    assets = createAssets(work.plan),
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
              <input
                aria-label={`Participant ${i + 1} name`}
                value={p.name}
                onChange={(e) =>
                  updatePerson(p.id, { name: e.target.value.slice(0, 40) })
                }
              />
              {work.participants.length > 1 && (
                <button
                  className="text-button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    setWork((w) => ({
                      ...w,
                      participants: w.participants.filter((x) => x.id !== p.id),
                    }))
                  }
                >
                  ×
                </button>
              )}
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
            <Tags
              disabled={which === "future" && !!work.futurePlan}
              tags={p[which === "memory" ? "memoryTags" : "futureTags"]}
              onChange={(tags) =>
                updatePerson(p.id, {
                  [which === "memory" ? "memoryTags" : "futureTags"]: tags,
                })
              }
            />
          </section>
        ))}
        {which === "memory" && (
          <button
            className="add-person"
            onClick={() =>
              setWork((w) => ({
                ...w,
                participants: [
                  ...w.participants,
                  {
                    id: crypto.randomUUID(),
                    name: `Participant ${String.fromCharCode(65 + w.participants.length)}`,
                    memory: "",
                    future: "",
                    memoryTags: [],
                    futureTags: [],
                  },
                ],
              }))
            }
          >
            + Add participant
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-symbol">
            <Flower />
          </span>
          <span>
            RELATIONAL
            <br />
            PORTRAIT
          </span>
        </a>
        <div className="project-label">
          INTERACTIVE STUDY <span>№ 001 / 2026</span>
        </div>
        <button
          className="outline-button"
          onClick={() => file.current?.click()}
        >
          Open portrait{" "}
          <span>
            <Arrow />
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Open portrait JSON"
          onChange={(e) => {
            void importWork(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>
      <div className="intro">
        <div>
          <div className="eyebrow">AN EXPERIMENT IN SHARED MEMORY</div>
          <h1>
            A world held
            <br />
            <em>in common.</em>
            <span className="title-star">✧</span>
          </h1>
        </div>
        <p>
          Two memories. One changing landscape.
          <br />A portrait of the space between you.
        </p>
        <div className="edition">
          <span>MEMORY → RELATION → POSSIBILITY</span>
          <i>01—05</i>
        </div>
      </div>
      <nav className="steps" aria-label="Portrait stages">
        {steps.map((step, i) => (
          <button
            key={step}
            aria-current={phase === step ? "step" : undefined}
            disabled={(i > 0 && !generated) || (i === 4 && !work.futurePlan)}
            onClick={() => setPhase(step)}
          >
            <b>{String(i + 1).padStart(2, "0")}</b>
            <span>{stepNames[i]}</span>
            {i < 4 && (
              <i>
                <Arrow />
              </i>
            )}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <section className="art-column">
          <div className="art-topline">
            <span>
              PORTRAIT NO. 001 <i>/</i>{" "}
              {generated ? work.title.toUpperCase() : "A PLACE NOT YET NAMED"}
            </span>
            <span className="mode-badge">
              <i />
              {replay
                ? "PLAYBACK"
                : !generated
                  ? "STUDIO PREVIEW"
                  : inputSource === "camera"
                    ? "CAMERA INPUT"
                    : "MANUAL INPUT"}
            </span>
          </div>
          <div
            className="art-frame"
            onPointerMove={(e) => {
              if (engine.current) {
                const b = e.currentTarget.getBoundingClientRect();
                engine.current.pointer = {
                  x: ((e.clientX - b.left) / b.width) * 2 - 1,
                  y: 1 - ((e.clientY - b.top) / b.height) * 2,
                };
              }
            }}
            onPointerLeave={() => {
              if (engine.current) engine.current.pointer = { x: 0, y: 0 };
            }}
          >
            <div className="three-host" ref={host} />
            {fatal && (
              <div className="render-error" role="alert">
                {fatal}
              </div>
            )}
            <div className="corner-mark tl">+</div>
            <div className="corner-mark br">+</div>
          </div>
          <div className="art-caption">
            <span>
              <b>{generated ? work.title : "The first fragment is a place."}</b>
              <small>
                {generated
                  ? `${work.participants.length} voices · ${work.plan.tags.slice(0, 3).join(" / ")}`
                  : "A live material preview. Begin with your shared memory."}
              </small>
            </span>
            <button
              className="circle-button"
              aria-label={playing ? "Pause animation" : "Resume animation"}
              onClick={togglePlay}
            >
              {playing ? (
                <span className="pause-mark" />
              ) : (
                <span className="play-mark" />
              )}
            </button>
            <span className="timestamp">{formatTime(clock.time)}</span>
          </div>
          <div className="layer-ribbon">
            {work.layers.map((l, i) => (
              <button
                key={l.id}
                className={!l.visible ? "muted" : ""}
                onClick={() => {
                  setSelectedLayer(l.id);
                  if (generated) setPhase("portrait");
                }}
              >
                <span className="layer-thumb">
                  <img src={l.custom || assets[l.id]} alt="" />
                </span>
                <span>
                  <small>
                    0{i + 1} / Z {l.z.toFixed(1)}
                  </small>
                  {l.name}
                </span>
              </button>
            ))}
          </div>
          {replay && (
            <div className="replay-bar">
              <span>RECORDED JOURNEY</span>
              <input
                type="range"
                aria-label="Journey timeline"
                min="0"
                max={Math.max(work.duration, 1)}
                step=".1"
                value={Math.min(clock.time, work.duration)}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  if (engine.current) {
                    engine.current.running = false;
                    engine.current.seek(t);
                  }
                  setClock((c) => ({ ...c, time: t }));
                  setPlaying(false);
                }}
              />
              <button onClick={returnLive}>
                Return to live <Arrow />
              </button>
            </div>
          )}
          <div className="art-footnote">
            <span>01 / EACH FRAGMENT HAS ITS OWN DEPTH.</span>
            <span>2.5D · REAL-TIME COMPOSITION</span>
          </div>
        </section>
        <aside className="control-panel">
          <div className="panel-heading">
            <span className="eyebrow">
              {String(active + 1).padStart(2, "0")} /{" "}
              {stepNames[active].toUpperCase()}
            </span>
            <span className="small-star">
              <Flower />
            </span>
          </div>
          <h2>{captions[active]}</h2>
          {phase === "memory" && (
            <>
              <p className="panel-copy">
                Write the same memory from different sides. Find a few motifs,
                then make them yours.
              </p>
              {peopleInputs("memory")}
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void findMotifs("memory")}
                >
                  Find shared motifs <span>✧</span>
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
              <p className="micro-note">
                LOCAL INTERPRETATION · EDITABLE MOTIFS
                <br />
                Your words stay in this browser until you export them.
              </p>
            </>
          )}
          {phase === "portrait" && (
            <>
              <p className="panel-copy">
                A campus suspended over remembered water. Every fragment can
                move independently.
              </p>
              <div className="layer-tabs">
                {work.layers.map((l) => (
                  <button
                    key={l.id}
                    aria-pressed={selectedLayer === l.id}
                    onClick={() => setSelectedLayer(l.id)}
                  >
                    {l.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <div className="layer-editor">
                <div className="layer-editor-title">
                  <strong>{layer.name}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(e) =>
                        setWork((w) => ({
                          ...w,
                          layers: patchLayer(w.layers, layer.id, {
                            visible: e.target.checked,
                          }),
                        }))
                      }
                    />{" "}
                    Visible
                  </label>
                </div>
                {(["x", "y", "z", "scale", "opacity"] as const).map((key) => (
                  <Range
                    key={key}
                    label={
                      {
                        x: "Horizontal position",
                        y: "Vertical position",
                        z: "Layer depth",
                        scale: "Size",
                        opacity: "Opacity",
                      }[key]
                    }
                    value={layer[key]}
                    min={
                      key === "scale"
                        ? 0.25
                        : key === "opacity"
                          ? 0
                          : key === "y"
                            ? -4
                            : -5
                    }
                    max={
                      key === "scale"
                        ? 2
                        : key === "opacity"
                          ? 1
                          : key === "y"
                            ? 4
                            : 5
                    }
                    onChange={(v) =>
                      setWork((w) => ({
                        ...w,
                        layers: patchLayer(w.layers, layer.id, { [key]: v }),
                      }))
                    }
                  />
                ))}
                <label className="upload-button">
                  ↑ Replace with transparent PNG
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
                {layer.custom && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setWork((w) => ({
                        ...w,
                        layers: patchLayer(w.layers, layer.id, {
                          custom: undefined,
                        }),
                      }))
                    }
                  >
                    Restore original fragment
                  </button>
                )}
              </div>
              <button
                className="primary-button"
                onClick={() => setPhase("interaction")}
              >
                Enter live interaction{" "}
                <span>
                  <Arrow />
                </span>
              </button>
              <p className="micro-note">
                FIVE SEPARATE LAYERS · TRANSPARENT TEXTURES
                <br />
                No image is regenerated when you move.
              </p>
            </>
          )}
          {phase === "interaction" && (
            <>
              <p className="panel-copy">
                Change the distance between you. The world finds a different way
                to connect.
              </p>
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
              <div className="signal-map">
                <div
                  className="signal-line"
                  style={{ width: `${24 + (1 - signals.proximity) * 60}%` }}
                />
                {work.participants.map((p, i) => (
                  <span
                    key={p.id}
                    style={{
                      left: `${work.participants.length === 1 ? 50 : 50 + (i / (work.participants.length - 1) - 0.5) * (22 + (1 - signals.proximity) * 62)}%`,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                ))}
                <small>
                  {inputSource === "camera"
                    ? `${tracked?.count || 0} / 2 BODY INPUTS`
                    : "SIMULATED POSITIONS"}
                </small>
              </div>
              <Range
                label="Distance between participants"
                value={1 - signals.proximity}
                unit="%"
                disabled={inputSource === "camera" || replay}
                onChange={(v) => manual("proximity", 1 - v)}
              />
              <Range
                label="Movement synchrony"
                value={signals.synchrony}
                unit="%"
                disabled={inputSource === "camera" || replay}
                onChange={(v) => manual("synchrony", v)}
              />
              <Range
                label="Raised hands"
                value={signals.hands}
                unit="%"
                disabled={inputSource === "camera" || replay}
                onChange={(v) => manual("hands", v)}
              />
              <Range
                label="Expression input (manual)"
                value={signals.expression}
                unit="%"
                disabled={replay}
                onChange={(v) => {
                  expression.current.value = v;
                  record({ ...signalsRef.current, expression: v }, inputSource);
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
                        ? "One body visible; distance needs two"
                        : "Waiting for bodies"}
                  </>
                )}
              </p>
              {(inputSource === "camera" || cameraBusy) && (
                <button className="text-button" onClick={stopCamera}>
                  Stop camera
                </button>
              )}
              <label className="preview-toggle">
                <input
                  type="checkbox"
                  checked={preview}
                  onChange={(e) => setPreview(e.target.checked)}
                />{" "}
                Show camera preview outside artwork
              </label>
              <p className="micro-note">
                MOVEMENT FEATURES ONLY · NO EMOTION INFERENCE
                <br />
                Pose tracks up to two people. Manual mode supports all voices.
              </p>
              <button
                className="primary-button"
                onClick={() => setPhase("future")}
              >
                Imagine what comes next{" "}
                <span>
                  <Arrow />
                </span>
              </button>
            </>
          )}
          {phase === "future" && (
            <>
              <p className="future-question">
                WHAT DO YOU IMAGINE
                <br />
                FOR YOUR FUTURE?
              </p>
              <p className="panel-copy">
                Keep what was. Add what could be. New fragments grow into the
                original portrait.
              </p>
              {peopleInputs("future")}
              <button
                className="secondary-button"
                disabled={busy || replay || !!work.futurePlan}
                onClick={() => void findMotifs("future")}
              >
                Find future motifs <span>✧</span>
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
                    className="secondary-button"
                    disabled={clock.evolution < 0.98}
                    onClick={() => setPhase("final")}
                  >
                    View final portrait <Arrow />
                  </button>
                </>
              )}
            </>
          )}
          {phase === "final" && (
            <>
              <p className="panel-copy">
                The old world is still here. A little more open, a little
                further from where it began.
              </p>
              <div className="final-card">
                <span>YOUR RELATIONAL PORTRAIT</span>
                <h3>{work.title}</h3>
                <p>{work.participants.map((p) => p.name).join(" + ")}</p>
                <div className="summary-tags">
                  {[
                    ...new Set([
                      ...work.plan.tags,
                      ...(work.futurePlan?.tags || []),
                    ]),
                  ].map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
              <button
                className="primary-button"
                disabled={!!fatal || clock.evolution < 0.98}
                onClick={() => void exportPNG()}
              >
                Export final PNG <span>↓</span>
              </button>
              <button className="secondary-button" onClick={replayJourney}>
                Replay the full journey <span>↺</span>
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
              <p className="micro-note">
                PNG 1600 × 900 · ARTWORK ONLY
                <br />
                JSON preserves your inputs, layers and motion timeline.
              </p>
            </>
          )}
          <div
            className="video-preview"
            hidden={!preview || phase !== "interaction"}
          >
            <video
              ref={video}
              muted
              playsInline
              autoPlay
              aria-label="Camera input preview"
            />
            <span>INPUT ONLY · NEVER INCLUDED IN EXPORT</span>
          </div>
        </aside>
      </main>
      <div className="notice" role="status">
        {notice || "A local experiment. An open-ended portrait."}
      </div>
      <footer>
        <span>
          RELATIONAL PORTRAIT <i>© 2026</i>
        </span>
        <span>
          A MEMORY IS NEVER A STILL IMAGE.{" "}
          <b>
            <Arrow />
          </b>
        </span>
        <span>EXPERIMENT / 01</span>
      </footer>
    </div>
  );
}
