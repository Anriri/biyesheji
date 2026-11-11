import { ArchiveSchema, imageData, type Archive } from "./domain";
export async function request<T>(path: string, data?: unknown): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 185000);
  try {
    const res = await fetch(path, {
      method: data ? "POST" : "GET",
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    let result;
    try {
      result = await res.json();
    } catch {
      throw new Error("服务暂时没有响应，输入与作品已保留，请重试。");
    }
    if (!res.ok) throw new Error(result.error || "请求失败，请重试。");
    return result;
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error("等待超时，输入与作品已保留，请重试。");
    if (e instanceof TypeError)
      throw new Error("连接中断，请确认服务仍在运行后重试。输入与作品已保留。");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export async function embeddedImage(src: string) {
  if (src.startsWith("data:")) return imageData.parse(src);
  const response = await fetch(src);
  if (!response.ok) throw new Error("预制肖像尚未载入，请重试。");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(imageData.parse(reader.result));
    reader.onerror = () => reject(new Error("读取图像失败。"));
    reader.readAsDataURL(blob);
  });
}
export function download(blob: Blob, name: string) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function downloadPortrait(image: string, name: string) {
  const mime = image.slice(5, image.indexOf(";"));
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  download(
    new Blob(
      [Uint8Array.from(atob(image.split(",")[1]), (c) => c.charCodeAt(0))],
      { type: mime },
    ),
    `${name}.${ext}`,
  );
}
export const ARCHIVE_KEY = "unfinished-portrait:archive:v1";
export function parseArchive(raw: string): Archive {
  if (raw.length > 18_000_000) throw new Error("档案文件过大。");
  const result = ArchiveSchema.safeParse(JSON.parse(raw));
  if (!result.success)
    throw new Error("这不是有效的《未完成的肖像》档案。当前内容已保留。");
  return result.data;
}
