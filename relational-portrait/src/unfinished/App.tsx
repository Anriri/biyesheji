import { useEffect, useRef, useState } from "react";
import {
  axes,
  labels,
  emptyPoints,
  total,
  summarize,
  exampleSelf,
  exampleWish,
  exampleStyle,
  examplePlans,
  differences,
  revision,
  revisionLinks,
  ContextSchema,
  ArchiveSchema,
  PlansSchema,
  imageData,
  type Self,
  type Points,
  type Context,
  type Candidate,
  type Portrait,
  type Archive,
} from "./domain";
import {
  request,
  embeddedImage,
  download,
  downloadPortrait,
  parseArchive,
  ARCHIVE_KEY,
} from "./client";
type Stage =
  | "cover"
  | "self"
  | "choice"
  | "translation"
  | "portrait"
  | "revision"
  | "reflection";
const steps = [
  ["self", "SELF"],
  ["choice", "CHOICE"],
  ["translation", "TRANSLATION"],
  ["portrait", "PORTRAIT"],
  ["reflection", "REFLECTION"],
] as const;
const newSelf = (): Self => ({
  keep: "",
  change: "",
  description: "",
  tags: [],
});
const tagOptions = [
  "习惯独处",
  "喜欢与人同行",
  "喜欢尝试",
  "重视稳定",
  "慢热",
  "好奇",
];
export default function UnfinishedPortrait() {
  const [stage, setStage] = useState<Stage>("cover"),
    [mode, setMode] = useState<"live" | "demo">("live");
  const [self, setSelf] = useState<Self>(newSelf),
    [points, setPoints] = useState<Points>(emptyPoints),
    [wish, setWish] = useState(""),
    [style, setStyle] = useState("暖白背景、克制色彩与有触感的表面。");
  const [photo, setPhoto] = useState<string>(),
    [tagDraft, setTagDraft] = useState(""),
    [plans, setPlans] = useState<Candidate[]>([]),
    [planId, setPlanId] = useState("");
  const [portraits, setPortraits] = useState<Portrait[]>([]),
    [selected, setSelected] = useState<"v1" | "v2">("v1"),
    [mobileView, setMobileView] = useState<"v1" | "v2">("v1"),
    [editing, setEditing] = useState(false),
    [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<"plans" | "initial" | "edit" | null>(null),
    [notice, setNotice] = useState(""),
    [imported, setImported] = useState(false),
    [hasSaved, setHasSaved] = useState(false),
    [furthest, setFurthest] = useState(0);
  const [service, setService] = useState<{
    configured: boolean;
    provider: string;
  } | null>(null);
  const importing = useRef<HTMLInputElement>(null),
    uploading = useRef<HTMLInputElement>(null),
    locked = useRef(false),
    attempt = useRef({ key: "", id: "" });
  const current = portraits.find((p) => p.id === selected) || portraits[0],
    first = portraits[0],
    plan = plans.find((p) => p.id === planId);
  const active =
    stage === "revision"
      ? 3
      : Math.max(
          0,
          steps.findIndex(([s]) => s === stage),
        );
  useEffect(() => {
    void request<{ configured: boolean; provider: string }>("/api/status")
      .then(setService)
      .catch(() => setService({ configured: false, provider: "OpenAI" }));
    try {
      setHasSaved(!!localStorage.getItem(ARCHIVE_KEY));
    } catch {
      /* Private browsing may disable storage. */
    }
  }, []);
  useEffect(() => {
    if (stage !== "cover") setFurthest((v) => Math.max(v, active));
  }, [stage, active]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setError("");
    setNotice("");
  }, [stage]);
  function begin(next: "demo" | "live") {
    if (next !== mode || !self.description || imported) {
      setSelf(next === "demo" ? structuredClone(exampleSelf) : newSelf());
      setPoints(emptyPoints());
      setWish(next === "demo" ? exampleWish : "");
      setStyle(
        next === "demo" ? exampleStyle : "暖白背景、克制色彩与有触感的表面。",
      );
      setPortraits([]);
      setPlans([]);
      setPhoto(undefined);
      setReflection("");
      setEditing(false);
      setImported(false);
      setFurthest(0);
    }
    setMode(next);
    setStage("self");
    setRetry(null);
    setError("");
  }
  const context = (): Context =>
    ContextSchema.parse({ self, points, wish, style });
  async function run(
    label: string,
    type: typeof retry,
    action: () => Promise<void>,
  ) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    setRetry(type);
    try {
      await action();
      setRetry(null);
    } catch (e) {
      setError(
        e instanceof DOMException
          ? "无法读取图片，请重新选择有效的 JPG、PNG 或 WebP 图片。"
          : e instanceof Error && e.name === "ZodError"
            ? "返回的信息不完整，已填内容会保留，请重试。"
            : e instanceof Error
              ? e.message
              : "操作失败，请重试。",
      );
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  async function makePlans() {
    await run(
      mode === "demo" ? "整理示例隐喻" : "正在整理视觉隐喻",
      "plans",
      async () => {
        const c = context();
        const result =
          mode === "demo"
            ? { candidates: examplePlans(c) }
            : await request<{ candidates: Candidate[] }>("/api/translate", c);
        const parsed = PlansSchema.parse(result);
        setPlans(parsed.candidates);
        setPlanId(parsed.candidates[0].id);
        setStage("translation");
      },
    );
  }
  async function generate(which: "initial" | "edit") {
    await run(
      mode === "demo"
        ? "正在读取预制肖像"
        : which === "initial"
          ? "正在生成第一幅肖像"
          : "正在局部编辑第二幅肖像",
      which,
      async () => {
        const c = context(),
          chosen = which === "edit" ? first.plan : plan;
        if (!chosen) throw new Error("请先确认一个视觉隐喻。");
        const id = which === "initial" ? "v1" : "v2";
        let image: string, links: Candidate["links"];
        if (mode === "demo") {
          image = await embeddedImage(`/unfinished/${id}.png`);
          links =
            which === "initial"
              ? chosen.links
              : revisionLinks(first.context, c, chosen);
        } else {
          const payload = {
            context: c,
            plan: chosen,
            mode: which,
            ...(photo ? { photo } : {}),
            ...(which === "edit"
              ? { baseImage: first.image, original: first.context }
              : {}),
          };
          const key = JSON.stringify(payload);
          if (attempt.current.key !== key)
            attempt.current = { key, id: crypto.randomUUID() };
          const result = await request<{
            image: string;
            links: Candidate["links"];
          }>("/api/portrait", { ...payload, requestId: attempt.current.id });
          image = imageData.parse(result.image);
          links = result.links.slice(0, 3);
        }
        const portrait: Portrait = {
          id,
          image,
          context: structuredClone(c),
          plan: structuredClone(chosen),
          links,
          mode,
          createdAt: new Date().toISOString(),
        };
        if (which === "initial") {
          setReflection("");
          setFurthest(3);
        }
        setPortraits((p) =>
          which === "initial" ? [portrait] : [p[0], portrait],
        );
        setSelected(id);
        setMobileView(id);
        setEditing(false);
        setStage("portrait");
      },
    );
  }
  function adjust() {
    setPoints({ ...first.context.points });
    setWish(first.context.wish);
    setSelf(structuredClone(first.context.self));
    setStyle(first.context.style);
    setEditing(true);
    setStage("choice");
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    await run("正在读取照片", null, async () => {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 4 * 1024 * 1024
      )
        throw new Error("请选择 4 MB 以内的 JPG、PNG 或 WebP 照片。");
      const bitmap = await createImageBitmap(file);
      const tooLarge = bitmap.width > 4096 || bitmap.height > 4096;
      bitmap.close();
      if (tooLarge) throw new Error("请将照片缩小至 4096 像素以内。");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setPhoto(data);
    });
  }
  async function restore(raw: string) {
    try {
      const archive = parseArchive(raw);
      const image = new Image();
      image.src = archive.portrait.image;
      await image.decode();
      if (Math.abs(image.naturalWidth / image.naturalHeight - 0.8) > 0.005)
        throw new Error("档案肖像须为 4:5 比例。");
      setPortraits([archive.portrait]);
      setSelected(archive.portrait.id);
      setMobileView(archive.portrait.id);
      setSelf(archive.portrait.context.self);
      setPoints(archive.portrait.context.points);
      setWish(archive.portrait.context.wish);
      setStyle(archive.portrait.context.style);
      setMode(archive.portrait.mode);
      setReflection(archive.reflection);
      setPhoto(undefined);
      setImported(true);
      setStage("reflection");
      setError("");
      setRetry(null);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "档案格式损坏，请重新选择 JSON 档案。当前内容已保留。"
          : e instanceof Error
            ? e.message
            : "档案无法打开，当前内容已保留。",
      );
    }
  }
  async function openFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 18_000_000) throw new Error("档案文件过大。");
      await restore(await file.text());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveArchive() {
    await run("正在整理个人档案", null, async () => {
      if (!current || !reflection.trim())
        throw new Error("先写下一项愿意采取的行动。");
      const archive: Archive = {
        format: "unfinished-portrait",
        version: 1,
        savedAt: new Date().toISOString(),
        portrait: { ...current, image: await embeddedImage(current.image) },
        reflection: reflection.trim(),
      };
      const raw = JSON.stringify(ArchiveSchema.parse(archive), null, 2);
      download(
        new Blob([raw], { type: "application/json" }),
        "未完成的肖像-个人档案.json",
      );
      try {
        localStorage.setItem(ARCHIVE_KEY, raw);
        setHasSaved(true);
        setNotice("档案已下载，也已保存到这台设备。");
      } catch {
        setNotice("档案已下载。本机存储空间不足，请保留下载文件。");
      }
    });
  }
  function retryAction() {
    if (retry === "plans") void makePlans();
    else if (retry) void generate(retry);
  }
  const delta =
    editing && first
      ? revision(first.context, { self, points, wish, style }, first.plan)
      : null;
  const errorBox = error ? (
    <div className="up-error" role="alert">
      <span>{error}</span>
      {retry && (
        <button onClick={retryAction} disabled={!!busy}>
          重试
        </button>
      )}
    </div>
  ) : null;
  const fileInput = (
    <input
      ref={importing}
      type="file"
      accept=".json,application/json"
      hidden
      aria-label="打开个人档案"
      onChange={(e) => {
        void openFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  return (
    <div className="up-app">
      <header className="up-header">
        <button className="up-brand" onClick={() => !busy && setStage("cover")}>
          未完成的肖像<span>THE UNFINISHED PORTRAIT</span>
        </button>
        <button
          className="up-text"
          aria-label="打开档案"
          onClick={() => importing.current?.click()}
          disabled={!!busy}
        >
          打开档案 ↗
        </button>
        {fileInput}
      </header>
      {stage === "cover" ? (
        <main className="up-cover">
          <section className="up-cover-copy">
            <p className="up-kicker">A SELF, STILL BECOMING.</p>
            <h1>
              未完成的
              <br />
              <span>肖像</span>
              <i>↗</i>
            </h1>
            <p className="up-invitation">
              如果十年后的你能回望今天，
              <br />
              你会做出怎样的选择？
            </p>
            <div className="up-cover-actions">
              <button className="up-primary" onClick={() => begin("live")}>
                开始塑造 <span aria-hidden="true">↗</span>
              </button>
              <button className="up-secondary" onClick={() => begin("demo")}>
                体验示例 <span aria-hidden="true">→</span>
              </button>
            </div>
            {hasSaved && (
              <button
                className="up-text up-last"
                onClick={() => {
                  try {
                    void restore(localStorage.getItem(ARCHIVE_KEY) || "");
                  } catch {
                    setError("无法读取本机档案，请使用档案文件。");
                  }
                }}
              >
                打开上次保存的档案
              </button>
            )}
            {service && !service.configured && (
              <p className="up-caption">真实生成尚未开放，可先体验示例。</p>
            )}
            {errorBox}
          </section>
          <figure className="up-cover-art">
            <img
              src="/unfinished/v1.png"
              alt="预制示例：人物站在包裹的纸质房间中"
            />
            <figcaption>
              <span>01 / A ROOM THAT UNFOLDS</span>
              <span>预制示例</span>
            </figcaption>
          </figure>
        </main>
      ) : (
        <>
          <nav className="up-steps" aria-label="体验步骤">
            {steps.map(([s, name], i) => (
              <button
                key={s}
                aria-current={i === active ? "step" : undefined}
                disabled={!!busy || i > furthest || imported}
                onClick={() => {
                  setEditing(false);
                  setStage(s);
                }}
              >
                <span>0{i + 1}</span>
                {name}
              </button>
            ))}
          </nav>
          {mode === "demo" && (
            <p className="up-demo">
              示例体验 · 虚构资料与固定预制图；修改输入不会重新生图。
            </p>
          )}
          <main className={`up-flow up-${stage}`} aria-busy={!!busy}>
            {stage === "self" && (
              <>
                <div className="up-heading">
                  <p>01 / SELF</p>
                  <h1>
                    先留下，
                    <br />
                    现在的你。
                  </h1>
                </div>
                <fieldset disabled={!!busy} className="up-self-form">
                  {mode === "live" && (
                    <section className="up-photo">
                      <div>
                        <h2>
                          本人照片 <small>选填</small>
                        </h2>
                        <p className="up-caption">
                          仅用于人物参考；真实生成时会发送给
                          OpenAI。原始照片默认不进入档案。
                        </p>
                        <button
                          className="up-secondary"
                          onClick={() => uploading.current?.click()}
                        >
                          {photo ? "更换照片" : "选择照片"} ↗
                        </button>
                        <input
                          ref={uploading}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          aria-label="上传本人照片"
                          onChange={(e) => {
                            void upload(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        {photo && (
                          <button
                            className="up-text"
                            onClick={() => setPhoto(undefined)}
                          >
                            移除照片
                          </button>
                        )}
                      </div>
                      {photo && <img src={photo} alt="本人照片预览" />}
                    </section>
                  )}
                  <section>
                    <h2>
                      性格与生活倾向 <small>可跳过</small>
                    </h2>
                    <div className="up-tags">
                      {[...new Set([...tagOptions, ...self.tags])].map(
                        (tag) => (
                          <button
                            key={tag}
                            aria-pressed={self.tags.includes(tag)}
                            onClick={() =>
                              setSelf((s) => ({
                                ...s,
                                tags: s.tags.includes(tag)
                                  ? s.tags.filter((t) => t !== tag)
                                  : s.tags.length < 12
                                    ? [...s.tags, tag]
                                    : s.tags,
                              }))
                            }
                          >
                            {tag}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="up-inline">
                      <input
                        aria-label="补充倾向标签"
                        value={tagDraft}
                        maxLength={30}
                        placeholder="也可以写下自己的词 / MBTI（选填）"
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (tagDraft.trim() && self.tags.length < 12) {
                              setSelf((s) => ({
                                ...s,
                                tags: [
                                  ...new Set([...s.tags, tagDraft.trim()]),
                                ],
                              }));
                              setTagDraft("");
                            }
                          }
                        }}
                      />
                      <button
                        className="up-text"
                        onClick={() => {
                          if (tagDraft.trim() && self.tags.length < 12) {
                            setSelf((s) => ({
                              ...s,
                              tags: [...new Set([...s.tags, tagDraft.trim()])],
                            }));
                            setTagDraft("");
                          }
                        }}
                      >
                        添加
                      </button>
                    </div>
                  </section>
                  <label>
                    现在的你，最想保留什么？
                    <textarea
                      value={self.keep}
                      maxLength={400}
                      onChange={(e) =>
                        setSelf((s) => ({ ...s, keep: e.target.value }))
                      }
                      placeholder="一个习惯，一种感受，或一件日常小事。"
                    />
                  </label>
                  <label>
                    未来的你，最想改变什么？
                    <textarea
                      value={self.change}
                      maxLength={400}
                      onChange={(e) =>
                        setSelf((s) => ({ ...s, change: e.target.value }))
                      }
                      placeholder="写一件对你具体而真实的事。"
                    />
                  </label>
                  <div className="up-description-head">
                    <h2>我的自我描述</h2>
                    <button
                      className="up-text"
                      onClick={() =>
                        setSelf((s) => ({ ...s, description: summarize(s) }))
                      }
                    >
                      整理描述 ↗
                    </button>
                  </div>
                  <textarea
                    aria-label="自我描述"
                    value={self.description}
                    maxLength={1800}
                    onChange={(e) =>
                      setSelf((s) => ({ ...s, description: e.target.value }))
                    }
                    placeholder="点击整理描述，或直接写下你现在的样子。确认前可以修改。"
                  />
                  <div className="up-actions">
                    <button
                      className="up-text"
                      onClick={() => setStage("cover")}
                    >
                      ← 返回
                    </button>
                    <button
                      className="up-primary"
                      disabled={!self.description.trim()}
                      onClick={() => setStage("choice")}
                    >
                      确认自我描述 <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </fieldset>
              </>
            )}
            {stage === "choice" && (
              <>
                <div className="up-heading">
                  <p>02 / CHOICE</p>
                  <h1>
                    {editing ? "同一个你，" : "十年以后，"}
                    <br />
                    {editing ? "另一种选择。" : "把什么放在前面？"}
                  </h1>
                  <p className="up-explain">
                    12 点表示时间和精力的优先顺序。
                    <br />
                    这些方向在现实中也可以互相促进。
                  </p>
                </div>
                <fieldset disabled={!!busy} className="up-choice-form">
                  <div className="up-budget">
                    <span>可投入的点数</span>
                    <strong aria-live="polite">
                      {12 - total(points)}
                      <small> / 12</small>
                    </strong>
                  </div>
                  <div className="up-point-grid">
                    {axes.map((axis, i) => {
                      const d =
                        editing && first
                          ? points[axis] - first.context.points[axis]
                          : 0;
                      return (
                        <div className="up-point" key={axis}>
                          <span className="up-caption">0{i + 1}</span>
                          <h2>{labels[axis]}</h2>
                          <div className="up-counter">
                            <button
                              aria-label={`${labels[axis]}减少1点`}
                              disabled={!points[axis]}
                              onClick={() =>
                                setPoints((p) => ({
                                  ...p,
                                  [axis]: p[axis] - 1,
                                }))
                              }
                            >
                              −
                            </button>
                            <output aria-label={`${labels[axis]}投入`}>
                              {points[axis]}
                            </output>
                            <button
                              aria-label={`${labels[axis]}增加1点`}
                              disabled={total(points) >= 12}
                              onClick={() =>
                                setPoints((p) => ({
                                  ...p,
                                  [axis]: p[axis] + 1,
                                }))
                              }
                            >
                              +
                            </button>
                          </div>
                          {d !== 0 && (
                            <small className="up-delta">
                              {d < 0
                                ? `从这里移出 ${-d} 点`
                                : `较第一幅增加 ${d} 点`}
                            </small>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {mode === "demo" && !editing && (
                    <button
                      className="up-text"
                      onClick={() =>
                        setPoints({
                          career: 6,
                          relationships: 3,
                          exploration: 1,
                          rest: 2,
                        })
                      }
                    >
                      使用示例分配（6 / 3 / 1 / 2）
                    </button>
                  )}
                  <label>
                    一个具体的十年后愿望
                    <textarea
                      aria-label="十年后愿望"
                      value={wish}
                      maxLength={500}
                      onChange={(e) => setWish(e.target.value)}
                      placeholder="我希望十年后的某一天，能……"
                    />
                  </label>
                  <div className="up-actions">
                    <button
                      className="up-text"
                      onClick={() => setStage(editing ? "portrait" : "self")}
                    >
                      ← 返回
                    </button>
                    <button
                      className="up-primary"
                      disabled={total(points) !== 12 || !wish.trim()}
                      onClick={() =>
                        editing ? setStage("revision") : void makePlans()
                      }
                    >
                      {editing ? "预览这次调整" : "寻找视觉隐喻"}{" "}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </fieldset>
              </>
            )}
            {stage === "translation" && (
              <>
                <div className="up-heading">
                  <p>03 / TRANSLATION</p>
                  <h1>
                    让选择，
                    <br />
                    成为不可能的事物。
                  </h1>
                </div>
                <fieldset disabled={!!busy} className="up-translation-form">
                  <div className="up-metaphors">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        className="up-metaphor"
                        aria-pressed={planId === p.id}
                        onClick={() => setPlanId(p.id)}
                      >
                        <span className="up-radio" />
                        <h2>{p.title}</h2>
                        <blockquote>
                          “{p.sourceQuotes.join("” · “")}”
                        </blockquote>
                        <p>
                          {p.qualities
                            .map((q) => `${q.trait} → ${q.property}`)
                            .join("；")}
                        </p>
                        <p>{p.impossibleObject}</p>
                        <p className="up-caption">{p.spatialRule}</p>
                      </button>
                    ))}
                  </div>
                  <label>
                    风格方向 <small>可以修改</small>
                    <textarea
                      aria-label="风格方向"
                      value={style}
                      maxLength={500}
                      onChange={(e) => setStyle(e.target.value)}
                    />
                  </label>
                  <div className="up-actions">
                    <button
                      className="up-text"
                      onClick={() => setStage("choice")}
                    >
                      ← 返回选择
                    </button>
                    <button
                      className="up-primary"
                      disabled={!plan || !style.trim()}
                      onClick={() => void generate("initial")}
                    >
                      生成第一幅肖像 <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </fieldset>
              </>
            )}
            {stage === "revision" && first && delta && (
              <>
                <figure className="up-revision-art">
                  <img
                    src={first.image}
                    alt="第一幅肖像，作为第二幅的编辑底图"
                  />
                  <figcaption>V1 / FIRST POSSIBILITY</figcaption>
                </figure>
                <section className="up-revision-copy">
                  <p className="up-kicker">ONE CHOICE, ANOTHER POSSIBILITY.</p>
                  <h1>只改这一次。</h1>
                  <div className="up-change-list">
                    {delta.points.map((d) => (
                      <p key={d.axis}>
                        <span>{d.label}</span>
                        <b>
                          {d.before} → {d.after}
                        </b>
                        <small>
                          {d.delta > 0 ? "+" : ""}
                          {d.delta}
                        </small>
                      </p>
                    ))}
                  </div>
                  {delta.wishChanged && (
                    <div className="up-wish-change">
                      <small>愿望调整</small>
                      <del>{delta.oldWish}</del>
                      <p>{delta.newWish}</p>
                    </div>
                  )}
                  <h2>计划调整的区域</h2>
                  {delta.regions.map((r, i) => (
                    <p className="up-region" key={i}>
                      <b>{r.area}</b>
                      {r.intention}
                    </p>
                  ))}
                  <p className="up-caption">
                    保留人物身份、构图骨架和「{first.plan.title}
                    」的核心隐喻。以上是设计意图。
                  </p>
                  <div className="up-actions">
                    <button
                      className="up-text"
                      disabled={!!busy}
                      onClick={() => setStage("choice")}
                    >
                      ← 再改一下
                    </button>
                    <button
                      className="up-primary"
                      disabled={
                        !!busy || (!delta.points.length && !delta.wishChanged)
                      }
                      onClick={() => void generate("edit")}
                    >
                      确认生成第二幅 <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </section>
              </>
            )}
            {stage === "portrait" && first && (
              <section className="up-results">
                <div className="up-result-heading">
                  <div>
                    <p className="up-kicker">04 / PORTRAIT</p>
                    <h1>
                      {portraits.length === 1
                        ? "未来的其中一种。"
                        : "没有唯一的未来。"}
                    </h1>
                  </div>
                  {portraits.length === 2 && (
                    <div className="up-mobile-tabs">
                      {portraits.map((p) => (
                        <button
                          key={p.id}
                          aria-pressed={mobileView === p.id}
                          onClick={() => setMobileView(p.id)}
                        >
                          {p.id.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`up-gallery ${portraits.length === 1 ? "up-single" : ""}`}
                >
                  {portraits.map((p) => (
                    <article
                      key={p.id}
                      className={`up-work ${mobileView === p.id ? "up-mobile-current" : ""}`}
                    >
                      <button
                        className="up-select-art"
                        aria-label={`选择${p.id === "v1" ? "第一" : "第二"}幅肖像`}
                        aria-pressed={selected === p.id}
                        onClick={() => setSelected(p.id)}
                      >
                        <img
                          src={p.image}
                          alt={`${p.id.toUpperCase()} ${p.plan.title}`}
                        />
                        <span>
                          {p.id.toUpperCase()} /{" "}
                          {p.id === "v1" ? "FIRST" : "ANOTHER"} POSSIBILITY{" "}
                          <i>{selected === p.id ? "已选择" : "选择这一幅"}</i>
                        </span>
                      </button>
                      <ul className="up-mappings">
                        {p.links.slice(0, 3).map((l, i) => (
                          <li key={i}>
                            <span>{l.choice}</span>
                            <p>→ {l.design}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                {portraits.length === 2 && (
                  <div className="up-comparison">
                    <h2>你的选择变化</h2>
                    <div>
                      {differences(
                        first.context.points,
                        portraits[1].context.points,
                      )
                        .filter((d) => d.delta !== 0)
                        .map((d) => (
                          <span key={d.axis}>
                            {d.label}{" "}
                            <b>
                              {d.before} → {d.after}（{d.delta > 0 ? "+" : ""}
                              {d.delta}）
                            </b>
                          </span>
                        ))}
                    </div>
                    {first.context.wish !== portraits[1].context.wish && (
                      <p>
                        愿望：<del>{first.context.wish}</del> →{" "}
                        {portraits[1].context.wish}
                      </p>
                    )}
                    <p className="up-caption">
                      画面解释为设计意图，不是对未来的预测。
                    </p>
                  </div>
                )}
                <div className="up-actions">
                  {portraits.length === 1 ? (
                    <>
                      <button
                        className="up-text"
                        disabled={!!busy}
                        onClick={() => setStage("translation")}
                      >
                        ← 返回隐喻
                      </button>
                      <button className="up-primary" onClick={adjust}>
                        调整一次选择 <span aria-hidden="true">→</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="up-caption">
                        已选择 {selected.toUpperCase()}
                      </span>
                      <button
                        className="up-primary"
                        onClick={() => setStage("reflection")}
                      >
                        带回现在 <span aria-hidden="true">→</span>
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
            {stage === "reflection" && current && (
              <>
                <figure className="up-reflection-art">
                  <img src={current.image} alt="选定的未来肖像" />
                  <figcaption>
                    {current.id.toUpperCase()} / {current.plan.title}
                    {imported ? " · 来自个人档案" : ""}
                  </figcaption>
                </figure>
                <section className="up-reflection-copy">
                  <p className="up-kicker">05 / REFLECTION</p>
                  <h1>
                    未来，
                    <br />
                    从一个动作开始。
                  </h1>
                  <label>
                    为了靠近这个未来，我现在愿意
                    <textarea
                      aria-label="我现在愿意采取的行动"
                      maxLength={1000}
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      placeholder="写下一件今天就能开始的小事。"
                    />
                  </label>
                  <p className="up-caption">
                    档案包含这幅作品对应的自我描述、愿望、投入点、视觉解释和行动，不包含原始照片。
                  </p>
                  <div className="up-reflection-actions">
                    <button
                      className="up-primary"
                      disabled={!!busy || !reflection.trim()}
                      onClick={() => void saveArchive()}
                    >
                      下载个人档案 <span aria-hidden="true">↓</span>
                    </button>
                    <button
                      className="up-secondary"
                      disabled={!!busy}
                      onClick={() =>
                        downloadPortrait(
                          current.image,
                          `未完成的肖像-${current.id}`,
                        )
                      }
                    >
                      下载肖像 <span aria-hidden="true">↓</span>
                    </button>
                    <button
                      className="up-text"
                      disabled={!!busy}
                      onClick={() => setStage(imported ? "cover" : "portrait")}
                    >
                      {imported ? "← 返回首页" : "← 返回比较"}
                    </button>
                  </div>
                  <details className="up-record">
                    <summary>查看这幅作品的档案内容</summary>
                    <p>{current.context.self.description}</p>
                    <p>愿望：{current.context.wish}</p>
                    {axes.map((axis) => (
                      <p key={axis}>
                        {labels[axis]}：{current.context.points[axis]} / 12
                      </p>
                    ))}
                    {current.links.map((l, i) => (
                      <p key={i}>
                        {l.choice} → {l.design}
                      </p>
                    ))}
                  </details>
                </section>
              </>
            )}
          </main>
          {busy && (
            <div className="up-status" role="status">
              <span className="up-spinner" />
              {busy}…
            </div>
          )}
          {errorBox}
          {notice && (
            <p className="up-notice" role="status">
              {notice}
            </p>
          )}
        </>
      )}
      <footer className="up-footer">
        <span>THE UNFINISHED PORTRAIT</span>
        <span>不是定论，是一种可能。</span>
      </footer>
    </div>
  );
}
