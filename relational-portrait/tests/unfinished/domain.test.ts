import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import sharp from "sharp";
import {
  ContextSchema,
  exampleSelf,
  exampleStyle,
  exampleWish,
  examplePlans,
  revision,
  revisionLinks,
  total,
  ArchiveSchema,
  validatePlan,
  type PortraitRequest,
} from "../../src/unfinished/domain.ts";
import { createAPI } from "../../server/api.ts";
import {
  imagePrompt,
  decodeImage,
  finishImage,
  type AIProvider,
} from "../../server/ai.ts";
const context = () =>
  ContextSchema.parse({
    self: structuredClone(exampleSelf),
    wish: exampleWish,
    style: exampleStyle,
    points: { career: 6, relationships: 3, exploration: 1, rest: 2 },
  });
const input = (): PortraitRequest => ({
  requestId: randomUUID(),
  context: context(),
  plan: examplePlans(context())[0],
  mode: "initial",
});
async function raster(width = 40, height = 50) {
  return sharp({
    create: { width, height, channels: 3, background: "#e8e4d4" },
  })
    .png()
    .toBuffer();
}
async function serve(ai: AIProvider | null) {
  const server = createServer(async (req, res) => {
    await createAPIOnce(req, res);
  });
  const createAPIOnce = createAPI(ai);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
test("12 points are conserved; revision identifies exact transfers and local regions without changing the metaphor", () => {
  const a = context(),
    b = { ...a, points: { ...a.points, career: 4, exploration: 3 } };
  assert.equal(total(b.points), 12);
  const plan = examplePlans(a)[0],
    diff = revision(a, b, plan);
  assert.deepEqual(
    diff.points.map((d) => [d.axis, d.delta]),
    [
      ["career", -2],
      ["exploration", 2],
    ],
  );
  assert.equal(diff.regions.length, 2);
  assert.match(
    diff.regions.find((r) => r.axis === "exploration")!.intention,
    /展开/,
  );
  assert.throws(() =>
    ContextSchema.parse({ ...a, points: { ...a.points, career: 7 } }),
  );
  const wish = revision(a, { ...a, wish: "我希望开一家小型工作室。" }, plan);
  assert.ok(wish.wishChanged);
  assert.equal(wish.regions.length, 1);
  const longWish = {
    ...a,
    wish: "我希望拥有一个可以画画和休息的空间。".repeat(24).slice(0, 500),
  };
  const links = revisionLinks(a, longWish, plan);
  assert.equal(links[0].choice, "愿望调整");
  assert.ok(links[0].design.length <= 220);
  const bad = structuredClone(plan);
  bad.sourceQuotes = ["不存在的个人经历"];
  assert.throws(() => validatePlan(bad, a));
});
test("the full original runtime template reaches generation, while a revision adds computed differences and preserves the base", async () => {
  const original = await readFile(
    new URL("../../docs/unfinished/brief.md", import.meta.url),
    "utf8",
  );
  const template = await readFile(
    new URL("../../server/prompts/portrait-v1.txt", import.meta.url),
    "utf8",
  );
  assert.equal(
    template.trim(),
    original
      .split("BEGIN IMAGE PROMPT\n")[1]
      .split("\nEND IMAGE PROMPT")[0]
      .trim(),
  );
  const r = input(),
    prompt = await imagePrompt(r);
  for (const title of [
    "2. PERSONAL MEANING → AN IMPOSSIBLE OBJECT",
    "3. IMPOSSIBLE OBJECT → IMPOSSIBLE COMPOSITION",
  ])
    assert.ok(prompt.includes(title));
  assert.ok(prompt.includes(exampleSelf.description));
  assert.ok(!prompt.includes("{{"));
  const next = {
    ...r,
    mode: "edit" as const,
    original: r.context,
    context: {
      ...r.context,
      points: { ...r.context.points, career: 4, exploration: 3 },
    },
    baseImage: "data:image/png;base64,AAAA",
  };
  const edit = await imagePrompt(next);
  assert.ok(edit.includes("localized_image_edit"));
  assert.ok(edit.includes('"delta":-2'));
  assert.ok(edit.includes('"delta":2'));
  assert.ok(edit.includes("image 1 is the first portrait"));
});
test("the server validates real bytes and produces exact 4:5 without stretching", async () => {
  const src = await raster(120, 180),
    png = await finishImage(src),
    meta = await sharp(png).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1280);
  await assert.rejects(
    decodeImage(
      "data:image/png;base64," + Buffer.from("not an image").toString("base64"),
      true,
    ),
  );
  const large = await raster(4100, 20);
  await assert.rejects(
    decodeImage("data:image/png;base64," + large.toString("base64"), true),
    /尺寸/,
  );
});
test("real mode without a credential reports configuration failure and never returns a demo image", async () => {
  const app = await serve(null);
  try {
    const res = await fetch(app.url + "/api/translate", {
      method: "POST",
      body: JSON.stringify(context()),
    });
    assert.equal(res.status, 503);
    const value = await res.json();
    assert.match(value.error, /尚未配置/);
    assert.equal(value.image, undefined);
  } finally {
    await app.close();
  }
});
test("duplicate requests coalesce, edits receive V1 first and identity reference separately, invalid point totals fail before AI", async () => {
  let calls = 0;
  const seen: {
    request: PortraitRequest;
    prompt: string;
    photo?: Buffer;
    base?: Buffer;
  }[] = [];
  const provider: AIProvider = {
    translate: async (c) => examplePlans(c),
    image: async (request, prompt, photo, base) => {
      calls++;
      seen.push({ request, prompt, photo, base });
      await new Promise((r) => setTimeout(r, 25));
      return raster();
    },
  };
  const app = await serve(provider);
  try {
    const post = (data: unknown) =>
      fetch(app.url + "/api/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    const r = input();
    r.photo = "data:image/png;base64," + (await raster()).toString("base64");
    const [one, two] = await Promise.all([post(r), post(r)]);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    const v1 = await one.json();
    assert.equal(calls, 1);
    assert.equal(seen[0].base, undefined);
    assert.ok(seen[0].photo);
    const next: PortraitRequest = {
      ...r,
      requestId: randomUUID(),
      mode: "edit",
      baseImage: v1.image,
      original: r.context,
      context: {
        ...r.context,
        points: { ...r.context.points, career: 4, exploration: 3 },
      },
    };
    const edited = await post(next);
    assert.equal(edited.status, 200);
    assert.equal(calls, 2);
    assert.ok(seen[1].base);
    assert.ok(seen[1].photo);
    assert.ok(seen[1].prompt.includes('"delta":2'));
    const bad = await post({
      ...r,
      requestId: randomUUID(),
      context: { ...r.context, points: { ...r.context.points, career: 12 } },
    });
    assert.equal(bad.status, 400);
    assert.equal(calls, 2);
    const unchanged = await post({
      ...next,
      requestId: randomUUID(),
      context: r.context,
    });
    assert.equal(unchanged.status, 400);
    const again = await post({
      ...r,
      context: { ...r.context, wish: "新的愿望" },
    });
    assert.equal(again.status, 400);
  } finally {
    await app.close();
  }
});
test("archives bind the selected version to its own choices and exclude raw photographs", async () => {
  const c = context(),
    plan = examplePlans(c)[0],
    image = "data:image/png;base64," + (await raster()).toString("base64");
  const archive = {
    format: "unfinished-portrait",
    version: 1,
    savedAt: new Date().toISOString(),
    portrait: {
      id: "v2",
      image,
      context: {
        ...c,
        points: { career: 4, relationships: 3, exploration: 3, rest: 2 },
      },
      plan,
      links: plan.links,
      createdAt: new Date().toISOString(),
      mode: "demo",
    },
    reflection: "每周留一个下午画画。",
  };
  const parsed = ArchiveSchema.parse(archive);
  assert.equal(parsed.portrait.context.points.exploration, 3);
  assert.ok(!JSON.stringify(parsed).includes("photo"));
  assert.throws(() => ArchiveSchema.parse({ ...archive, photo: image }));
  assert.throws(() =>
    ArchiveSchema.parse({
      ...archive,
      portrait: {
        ...archive.portrait,
        image: "https://untrusted.example/image.png",
      },
    }),
  );
});
test("the actual OpenAI SDK serializes identity references and image edits in the documented order", async () => {
  const { createOpenAIProvider } = await import("../../server/ai.ts");
  const source = await raster(),
    captures: { path: string; json?: any; form?: FormData }[] = [];
  const transport: typeof fetch = async (url, init) => {
    const req = new Request(url, init),
      path = new URL(req.url).pathname;
    const entry: { path: string; json?: any; form?: FormData } = { path };
    if (req.headers.get("content-type")?.startsWith("multipart/form-data"))
      entry.form = await req.formData();
    else entry.json = await req.json();
    captures.push(entry);
    return new Response(
      JSON.stringify(
        path.endsWith("/chat/completions")
          ? {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      candidates: examplePlans(context()),
                    }),
                  },
                },
              ],
            }
          : { data: [{ b64_json: source.toString("base64") }] },
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const provider = createOpenAIProvider("test-not-a-real-key", transport),
    r = input(),
    prompt = await imagePrompt(r);
  await provider.translate(r.context);
  assert.equal(captures[0].json.response_format.type, "json_schema");
  await provider.image(r, prompt);
  assert.ok(captures[1].path.endsWith("/images/generations"));
  assert.ok(captures[1].json.prompt.includes("3. IMPOSSIBLE OBJECT"));
  await provider.image(r, prompt, source);
  assert.ok(captures[2].path.endsWith("/images/edits"));
  assert.equal(
    (captures[2].form!.getAll("image[]")[0] as File).name,
    "identity-reference.jpg",
  );
  await provider.image(
    {
      ...r,
      mode: "edit",
      original: r.context,
      baseImage: "data:image/png;base64,AAAA",
    },
    prompt,
    source,
    source,
  );
  const files = captures[3].form!.getAll("image[]") as File[];
  assert.equal(files[0].name, "first-portrait.png");
  assert.equal(files[1].name, "identity-reference.jpg");
  assert.equal(captures[3].form!.get("size"), "1024x1536");
  assert.equal(captures[3].form!.get("input_fidelity"), null);
});
