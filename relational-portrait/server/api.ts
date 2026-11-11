import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  ContextSchema,
  PlansSchema,
  PortraitRequestSchema,
  validatePlan,
  revision,
  revisionLinks,
} from "../src/unfinished/domain.ts";
import {
  createOpenAIProvider,
  decodeImage,
  finishImage,
  imagePrompt,
  type AIProvider,
  TEMPLATE_VERSION,
} from "./ai.ts";
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage) {
  let bytes = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32 * 1024 * 1024)
      throw new Error("提交内容过大，请使用较小的图片。");
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export function createAPI(provider?: AIProvider | null) {
  const cache = new Map<
    string,
    { hash: string; at: number; promise: Promise<unknown> }
  >();
  const key = process.env.OPENAI_API_KEY?.trim();
  const configured =
    provider === null
      ? false
      : !!provider || (!!key && !/^(replace_|your_)/i.test(key));
  const ai = provider || (configured ? createOpenAIProvider(key!) : null);
  return async function api(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    if (req.method === "GET" && url.pathname === "/api/status") {
      send(res, 200, {
        configured,
        provider: "OpenAI",
        templateVersion: TEMPLATE_VERSION,
      });
      return true;
    }
    if (
      req.method !== "POST" ||
      !["/api/translate", "/api/portrait"].includes(url.pathname)
    ) {
      send(res, 404, { error: "接口不存在。" });
      return true;
    }
    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      ) {
        send(res, 403, { error: "请从本站提交请求。" });
        return true;
      }
      const payload = await body(req);
      if (!ai) {
        send(res, 503, {
          error:
            "真实生成服务尚未配置。已填内容会保留；请稍后重试，或从首页选择体验示例。",
        });
        return true;
      }
      if (url.pathname === "/api/translate") {
        const context = ContextSchema.parse(payload);
        const candidates = PlansSchema.parse({
          candidates: await ai.translate(context),
        }).candidates.map((p, i) => ({ ...p, id: `proposal-${i + 1}` }));
        candidates.forEach((p) => validatePlan(p, context));
        send(res, 200, { candidates });
        return true;
      }
      const input = PortraitRequestSchema.parse(payload);
      validatePlan(
        input.plan,
        input.mode === "edit" && input.original
          ? input.original
          : input.context,
      );
      if (input.mode === "edit") {
        if (!input.baseImage || !input.original)
          throw new Error("第二幅必须提供第一幅肖像与原始选择。");
        if (
          JSON.stringify(input.original.self) !==
            JSON.stringify(input.context.self) ||
          input.original.style !== input.context.style
        )
          throw new Error("编辑时请保持已确认的自我描述和风格。");
        const diff = revision(input.original, input.context, input.plan);
        if (!diff.points.length && !diff.wishChanged)
          throw new Error("请先调整投入点或愿望。");
      } else if (input.baseImage || input.original)
        throw new Error("首次生成不能携带编辑底图。");
      const hash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      for (const [key, entry] of cache)
        if (Date.now() - entry.at > 15 * 60_000) cache.delete(key);
      const prior = cache.get(input.requestId);
      if (prior && prior.hash !== hash)
        throw new Error("这次请求已被修改，请重新提交。");
      if (!prior && cache.size >= 12)
        throw new Error("生成服务正在处理其他作品，请稍后重试。");
      if (!prior) {
        const promise = (async () => {
          const photo = input.photo
            ? await decodeImage(input.photo, true)
            : undefined;
          const base = input.baseImage
            ? await decodeImage(input.baseImage)
            : undefined;
          const prompt = await imagePrompt(input);
          const buffer = await finishImage(
            await ai.image(input, prompt, photo, base),
          );
          const diff =
            input.mode === "edit"
              ? revision(input.original!, input.context, input.plan)
              : null;
          const links = diff
            ? revisionLinks(input.original!, input.context, input.plan)
            : input.plan.links;
          return {
            image: `data:image/png;base64,${buffer.toString("base64")}`,
            links,
            templateVersion: TEMPLATE_VERSION,
          };
        })();
        const cacheKey = input.requestId;
        cache.set(cacheKey, { hash, at: Date.now(), promise });
        // Expire even when the service receives no further requests. Keep only
        // the request ID in this timer, never its original photo or answers.
        const expiry = setTimeout(() => {
          if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
        }, 15 * 60_000);
        expiry.unref();
        promise.catch(() => {
          clearTimeout(expiry);
          if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
        });
      }
      send(res, 200, await cache.get(input.requestId)!.promise);
    } catch (error) {
      // No request bodies, photos, provider errors or credentials are logged.
      const e = error as { name?: string; status?: number; message?: string };
      const validation = e.name === "ZodError" || e.name === "SyntaxError";
      const status = validation
        ? 400
        : e.status === 429
          ? 429
          : e.status
            ? 502
            : 400;
      const message = validation
        ? "输入或视觉方案不完整，请检查后重试。"
        : e.status === 429
          ? "生成服务繁忙，请稍后重试。"
          : e.name === "APIConnectionTimeoutError"
            ? "生成超时。已完成的作品和表单会保留，请重试。"
            : e.status
              ? "生成服务暂时不可用，请重试。"
              : e.message || "生成失败，请重试。";
      send(res, status, { error: message });
    }
    return true;
  };
}
