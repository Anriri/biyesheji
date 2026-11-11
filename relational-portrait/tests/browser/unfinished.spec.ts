import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { examplePlans, exampleWish } from "../../src/unfinished/domain";
const primary = (page: any, name: string) =>
  page.getByRole("button", { name, exact: true });
async function demo(page: any) {
  await page.goto("/");
  await primary(page, "体验示例").click();
  await primary(page, "确认自我描述").click();
  await page.getByRole("button", { name: /使用示例分配/ }).click();
  await primary(page, "寻找视觉隐喻").click();
  await primary(page, "生成第一幅肖像").click();
  await expect(page.locator(".up-work")).toHaveCount(1);
}
async function second(page: any) {
  await primary(page, "调整一次选择").click();
  await primary(page, "事业与创造减少1点").click();
  await primary(page, "事业与创造减少1点").click();
  await primary(page, "探索与自由增加1点").click();
  await primary(page, "探索与自由增加1点").click();
  await primary(page, "预览这次调整").click();
  await primary(page, "确认生成第二幅").click();
  await expect(page.locator(".up-work")).toHaveCount(2);
}
test("full demo: constrained allocation, meaningful revision, V1 archive correctness, download and reopen", async ({
  page,
}) => {
  const errors: string[] = [],
    aiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith("/api/portrait") || r.url().endsWith("/api/translate"))
      aiRequests.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "未完成的",
  );
  await page.screenshot({
    path: "test-results/unfinished-cover.png",
    fullPage: true,
  });
  await primary(page, "体验示例").click();
  const description = await page
    .getByRole("textbox", { name: "自我描述", exact: true })
    .inputValue();
  await primary(page, "确认自我描述").click();
  await expect(primary(page, "寻找视觉隐喻")).toBeDisabled();
  for (const [name, n] of [
    ["事业与创造", 6],
    ["关系与陪伴", 3],
    ["探索与自由", 1],
    ["休息与享受", 2],
  ] as const)
    for (let i = 0; i < n; i++) await primary(page, name + "增加1点").click();
  await expect(primary(page, "事业与创造增加1点")).toBeDisabled();
  await primary(page, "← 返回").click();
  await expect(
    page.getByRole("textbox", { name: "自我描述", exact: true }),
  ).toHaveValue(description);
  await primary(page, "确认自我描述").click();
  await expect(page.getByLabel("事业与创造投入", { exact: true })).toHaveText(
    "6",
  );
  await primary(page, "寻找视觉隐喻").click();
  await expect(page.locator(".up-metaphor")).toHaveCount(2);
  await primary(page, "生成第一幅肖像").click();
  await primary(page, "调整一次选择").click();
  await primary(page, "事业与创造减少1点").click();
  await primary(page, "事业与创造减少1点").click();
  await expect(page.locator(".up-budget strong")).toContainText("2");
  await expect(page.locator(".up-delta").first()).toContainText("移出 2 点");
  await expect(primary(page, "预览这次调整")).toBeDisabled();
  await primary(page, "探索与自由增加1点").click();
  await primary(page, "探索与自由增加1点").click();
  await page
    .getByRole("textbox", { name: "十年后愿望", exact: true })
    .fill("我想带着速写本，在每年春天到山里住一周。");
  await primary(page, "预览这次调整").click();
  await expect(page.locator(".up-change-list")).toContainText("6 → 4");
  await expect(page.locator(".up-change-list")).toContainText("1 → 3");
  await expect(page.locator(".up-wish-change")).toContainText("每年春天");
  await primary(page, "确认生成第二幅").click();
  await expect(page.locator(".up-work")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/unfinished-comparison.png",
    fullPage: true,
  });
  await primary(page, "选择第一幅肖像").click();
  await primary(page, "带回现在").click();
  await page
    .getByRole("textbox", { name: "我现在愿意采取的行动", exact: true })
    .fill("这周六留一个下午，带着速写本出门。");
  const wait = page.waitForEvent("download");
  await primary(page, "下载个人档案").click();
  const file = await wait,
    path = await file.path(),
    archive = JSON.parse(readFileSync(path!, "utf8"));
  expect(archive.portrait.id).toBe("v1");
  expect(archive.portrait.context.points.career).toBe(6);
  expect(archive.portrait.context.points.exploration).toBe(1);
  expect(archive.portrait.context.wish).toBe(exampleWish);
  expect(JSON.stringify(archive)).not.toContain('"photo"');
  expect(
    await page.evaluate(
      () => !!localStorage.getItem("unfinished-portrait:archive:v1"),
    ),
  ).toBe(true);
  const pngWait = page.waitForEvent("download");
  await primary(page, "下载肖像").click();
  const png = readFileSync((await (await pngWait).path())!);
  expect(png.readUInt32BE(16) * 5).toBe(png.readUInt32BE(20) * 4);
  await page.locator(".up-brand").click();
  await page.getByLabel("打开个人档案", { exact: true }).setInputFiles(path!);
  await expect(page.locator(".up-reflection-art figcaption")).toContainText(
    "V1",
  );
  await expect(
    page.getByRole("textbox", { name: "我现在愿意采取的行动", exact: true }),
  ).toHaveValue(archive.reflection);
  await page.getByLabel("打开个人档案", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "我现在愿意采取的行动", exact: true }),
  ).toHaveValue(archive.reflection);
  expect(errors).toEqual([]);
  expect(aiRequests).toEqual([]);
});
test("mobile comparison switches images in place, selection is explicit and reduced motion is supported", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await demo(page);
  await second(page);
  await page
    .locator(".up-mobile-tabs")
    .getByRole("button", { name: "V1", exact: true })
    .click();
  const first = await page.locator(".up-mobile-current img").boundingBox();
  await page
    .locator(".up-mobile-tabs")
    .getByRole("button", { name: "V2", exact: true })
    .click();
  const next = await page.locator(".up-mobile-current img").boundingBox();
  expect(next!.y).toBeCloseTo(first!.y, 0);
  expect(next!.height).toBeCloseTo(first!.height, 0);
  await primary(page, "选择第二幅肖像").click();
  await page.screenshot({
    path: "test-results/unfinished-mobile.png",
    fullPage: true,
  });
  await primary(page, "带回现在").click();
  await expect(page.locator(".up-reflection-art figcaption")).toContainText(
    "V2",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
});
test("real mode preserves photo and answers, retries text/generation/edit errors, and sends V1 as editing base", async ({
  page,
}) => {
  let translates = 0,
    images = 0;
  const requests: any[] = [];
  await page.route("**/api/translate", async (route) => {
    translates++;
    if (translates === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "真实生成服务尚未配置。已填内容会保留。" },
      });
      return;
    }
    const c = route.request().postDataJSON();
    expect(c.photo).toBeUndefined();
    await route.fulfill({ json: { candidates: examplePlans(c) } });
  });
  const data = (v: string) =>
    "data:image/png;base64," +
    readFileSync("public-portrait/unfinished/" + v + ".png").toString("base64");
  await page.route("**/api/portrait", async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    images++;
    if (images === 1 || images === 3) {
      await route.fulfill({
        status: 502,
        json: { error: "生成服务暂时不可用，请重试。" },
      });
      return;
    }
    await route.fulfill({
      json: {
        image: data(payload.mode === "initial" ? "v1" : "v2"),
        links: payload.plan.links,
      },
    });
  });
  await page.goto("/");
  await primary(page, "开始塑造").click();
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 50;
    c.getContext("2d")!.fillRect(0, 0, 40, 50);
    return c.toDataURL().split(",")[1];
  });
  await page.getByLabel("上传本人照片", { exact: true }).setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  });
  await expect(page.getByAltText("本人照片预览")).toBeVisible();
  await page
    .getByRole("textbox", { name: "现在的你，最想保留什么？", exact: true })
    .fill("安静地画画");
  await page
    .getByRole("textbox", { name: "未来的你，最想改变什么？", exact: true })
    .fill("不敢独自旅行");
  await page.getByRole("button", { name: /整理描述/ }).click();
  await primary(page, "确认自我描述").click();
  for (let i = 0; i < 6; i++) await primary(page, "事业与创造增加1点").click();
  for (let i = 0; i < 3; i++) await primary(page, "关系与陪伴增加1点").click();
  await primary(page, "探索与自由增加1点").click();
  for (let i = 0; i < 2; i++) await primary(page, "休息与享受增加1点").click();
  await page
    .getByRole("textbox", { name: "十年后愿望", exact: true })
    .fill("带着速写本去山里旅行。");
  await primary(page, "寻找视觉隐喻").click();
  await expect(page.getByRole("alert")).toContainText("尚未配置");
  await expect(
    page.getByRole("textbox", { name: "十年后愿望", exact: true }),
  ).toHaveValue("带着速写本去山里旅行。");
  await primary(page, "重试").click();
  await primary(page, "生成第一幅肖像").click();
  await expect(page.getByRole("alert")).toContainText("不可用");
  await primary(page, "重试").click();
  await expect(page.locator(".up-work")).toHaveCount(1);
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[1].photo).toContain("data:image/png");
  await primary(page, "调整一次选择").click();
  await primary(page, "事业与创造减少1点").click();
  await primary(page, "探索与自由增加1点").click();
  await primary(page, "预览这次调整").click();
  await primary(page, "确认生成第二幅").click();
  await expect(page.getByRole("alert")).toContainText("不可用");
  await expect(page.locator(".up-revision-art img")).toHaveAttribute(
    "src",
    data("v1"),
  );
  await primary(page, "重试").click();
  await expect(page.locator(".up-work")).toHaveCount(2);
  expect(requests[3].mode).toBe("edit");
  expect(requests[3].baseImage).toBe(data("v1"));
  expect(requests[3].original.points.career).toBe(6);
  expect(requests[3].context.points.career).toBe(5);
  expect(requests[2].requestId).toBe(requests[3].requestId);
});
