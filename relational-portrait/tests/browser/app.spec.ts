import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});
async function generated(page: any) {
  await page
    .getByRole("button", { name: "Generate portrait", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enter live interaction" }),
  ).toBeVisible();
}
async function save(page: any) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Portrait JSON" }).click();
  const file = await waiting;
  const path = await file.path();
  return { path, data: JSON.parse(readFileSync(path, "utf8")) };
}
test("complete journey: editable memory motifs, manual interaction, additive future, PNG/text/JSON and replay", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/XNNPACK|INFO:/.test(m.text()))
      errors.push(m.text());
  });
  await page.getByRole("button", { name: "Find shared motifs" }).click();
  await page.locator(".tags-fold summary").first().click();
  await page
    .getByRole("textbox", { name: "Edit motif 1", exact: true })
    .first()
    .fill("Campus paths");
  await page
    .getByRole("button", { name: "Remove Nostalgia", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "New motif", exact: true })
    .first()
    .fill("Blue hour");
  await page
    .getByRole("button", { name: "Add motif", exact: true })
    .first()
    .click();
  await generated(page);
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  const distance = page.getByRole("slider", {
    name: "Distance between participants",
    exact: true,
  });
  await distance.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(200);
  await distance.focus();
  await page.keyboard.press("Home");
  await page
    .getByRole("slider", { name: "Expression input (manual)", exact: true })
    .focus();
  await page.keyboard.press("End");
  await page.screenshot({
    path: "test-results/relational-interaction.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Imagine what comes next" }).click();
  await page.getByRole("button", { name: "Find future motifs" }).click();
  await page.getByRole("button", { name: "Grow this world" }).click();
  await expect(
    page.getByRole("button", { name: "View final portrait" }),
  ).toBeEnabled({ timeout: 22000 });
  await page.getByRole("button", { name: "View final portrait" }).click();
  const { data } = await save(page);
  expect(data.participants).toHaveLength(2);
  expect(data.plan.tags).toContain("Blue hour");
  expect(data.plan.tags).toContain("Campus paths");
  expect(data.participants[0].memoryTags).not.toContain("Nostalgia");
  expect(data.futurePlan.tags).toContain("Ocean");
  expect(data.futurePlan.tags).toContain("Reunion");
  expect(data.layers).toHaveLength(5);
  expect(data.frames.some((f: any) => f.signals.proximity === 0)).toBe(true);
  expect(data.frames.some((f: any) => f.signals.expression === 1)).toBe(true);
  const pngWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export final PNG" }).click();
  const png = readFileSync(await (await pngWait).path());
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.readUInt32BE(20)).toBe(900);
  expect(png.length).toBeGreaterThan(20000);
  const textWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Text & motifs" }).click();
  expect(readFileSync(await (await textWait).path(), "utf8")).toContain(
    "campus pond",
  );
  await page.screenshot({
    path: "test-results/relational-final.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Replay the full journey" }).click();
  await expect(page.locator(".mode-badge")).toContainText("PLAYBACK");
  await expect(page.locator(".mode-badge")).toContainText("MANUAL", {
    timeout: 40000,
  });
  expect(errors).toEqual([]);
});
test("independent PNG replacement preserves initial scene depth and exported artwork", async ({
  page,
}) => {
  await generated(page);
  await page.locator(".asset-tools summary").click();
  // Generate a valid transparent PNG using the browser encoder.
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    c.getContext("2d")!.fillRect(5, 5, 10, 10);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload Campus fragments PNG").setInputFiles({
    name: "fragment.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.locator(".notice")).toContainText("replaced");
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  await page.getByRole("button", { name: "Imagine what comes next" }).click();
  await page.getByRole("button", { name: "Find future motifs" }).click();
  await page.getByRole("button", { name: "Grow this world" }).click();
  await page.getByRole("button", { name: /05.*Final portrait/ }).click();
  const saved = await save(page);
  expect(saved.data.participants).toHaveLength(2);
  expect(saved.data.layers.find((l: any) => l.id === "architecture").z).toBe(
    -1.3,
  );
  expect(
    saved.data.layers.find((l: any) => l.id === "architecture").custom,
  ).toMatch(/^data:image\/png/);
});
test("camera denial and model failure return to usable manual controls without changing the artwork", async ({
  page,
}) => {
  await generated(page);
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(page.locator(".camera-status")).toContainText(
    "permission denied",
  );
  await expect(
    page.getByRole("slider", {
      name: "Distance between participants",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.locator(".mode-badge")).toContainText("MANUAL");
  await page.reload();
  await generated(page);
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  await page.route("**/models/pose_landmarker_lite.task", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(page.locator(".camera-status")).toContainText("model missing", {
    timeout: 20000,
  });
  await expect(
    page.getByRole("slider", {
      name: "Distance between participants",
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.srcObject),
  ).toBeNull();
});
test("local CPU pose model really initializes and runs on a camera stream; stopping releases input", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (req) => {
    if (
      req.url().startsWith("http") &&
      !req.url().startsWith("http://localhost:5174/")
    )
      external.push(req.url());
  });
  await generated(page);
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await expect(page.locator(".camera-status")).toContainText("Camera active", {
    timeout: 30000,
  });
  await expect
    .poll(async () => await page.locator(".camera-status").innerText())
    .toMatch(/FPS/);
  await expect(page.locator(".mode-badge")).toContainText("CAMERA");
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await expect(page.locator(".mode-badge")).toContainText("MANUAL");
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.srcObject),
  ).toBeNull();
  await page.waitForTimeout(250);
  expect(external).toEqual([]);
});
test("real Three scene: proximity closes groups, raised hands lift fish, future keeps the original meshes", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { PortraitEngine } = await import("/src/engine.ts");
    const { newWork } = await import("/src/work.ts");
    const { planFromTags } = await import("/src/services/creative.ts");
    const host = document.createElement("div");
    host.style.cssText = "width:640px;height:360px;position:fixed;top:0;left:0";
    document.body.append(host);
    const e = new PortraitEngine(host, () => {});
    const w = newWork();
    e.configure(w);
    e.running = false;
    e.setSignals({ proximity: 0, synchrony: 1, hands: 0, expression: 0 });
    e.seek(10);
    const far = Math.abs(e.fishes[0].position.x - e.fishes[4].position.x),
      low = e.fishes[0].position.y;
    e.setSignals({ proximity: 1, synchrony: 1, hands: 1, expression: 0 });
    e.seek(10);
    const near = Math.abs(e.fishes[0].position.x - e.fishes[4].position.x),
      high = e.fishes[0].position.y;
    e.setBodies([{ x: 0.25, y: 0.6 }]);
    e.seek(10);
    const left = e.fishes[0].position.clone(),
      other = e.fishes[4].position.clone();
    const traceLeft = e.traces[0].geometry.attributes.position.getX(0);
    e.setBodies([{ x: 0.75, y: 0.3 }]);
    e.seek(10);
    const movement = {
      x: e.fishes[0].position.x - left.x,
      y: e.fishes[0].position.y - left.y,
      other: e.fishes[4].position.distanceTo(other),
      trace: e.traces[0].geometry.attributes.position.getX(0) - traceLeft,
    };
    e.setBodies([]);
    const original = e.planes.get("architecture")!.id;
    e.configure({
      ...w,
      futurePlan: planFromTags(["Ocean", "University"], "future"),
      futureAt: 10,
    });
    e.seek(22);
    const preserved = e.planes.get("architecture")!.id === original,
      opacity = (e.futurePlane.material as any).opacity;
    e.configure({
      ...w,
      participants: [
        ...w.participants,
        { ...w.participants[0], id: "third", name: "Participant C" },
      ],
    });
    const threeParticipantFish = e.fishes.length;
    e.dispose();
    host.remove();
    return {
      far,
      near,
      low,
      high,
      preserved,
      opacity,
      threeParticipantFish,
      movement,
    };
  });
  expect(result.far - result.near).toBeGreaterThan(5);
  expect(result.high - result.low).toBeCloseTo(1.65, 2);
  expect(result.preserved).toBe(true);
  expect(result.threeParticipantFish).toBe(12);
  expect(result.movement.x).toBeCloseTo(1.9);
  expect(result.movement.y).toBeCloseTo(0.9);
  expect(result.movement.trace).toBeCloseTo(1.9);
  expect(result.movement.other).toBe(0);
  expect(result.opacity).toBeGreaterThan(0.7);
});
test("small screens retain a 16:9 WebGL artwork without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const box = await page.locator(".art-frame").boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
  await page.screenshot({
    path: "test-results/relational-mobile.png",
    fullPage: true,
  });
});

test("cancelling camera setup cannot reopen a late stream or switch manual mode back", async ({
  page,
}) => {
  await generated(page);
  await page.getByRole("button", { name: "Enter live interaction" }).click();
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const stream = await original(constraints);
      (window as any).lateCameraTrack = stream.getVideoTracks()[0];
      return stream;
    };
  });
  await page.getByRole("button", { name: "Use camera", exact: true }).click();
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).lateCameraTrack?.readyState),
    )
    .toBe("ended");
  await expect(page.locator(".mode-badge")).toContainText("MANUAL");
  await expect(page.locator(".camera-status")).toContainText("Camera is off");
});
