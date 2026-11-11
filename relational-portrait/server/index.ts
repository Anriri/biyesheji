import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAPI } from "./api.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
const api = createAPI();
const server = createServer();
const vite = production
  ? null
  : await import("vite").then((v) =>
      v.createServer({
        root,
        server: { middlewareMode: true, ws: { server } },
        appType: "spa",
      }),
    );
server.on("request", async (req, res) => {
  try {
    if (await api(req, res)) return;
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const file = path.resolve(
      root,
      "dist",
      "." + decodeURIComponent(url.pathname),
    );
    if (
      file !== path.join(root, "dist") &&
      !file.startsWith(path.join(root, "dist") + path.sep)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let target = file;
    try {
      if (!(await stat(target)).isFile())
        target = path.join(root, "dist/index.html");
    } catch {
      target = path.extname(file) ? file : path.join(root, "dist/index.html");
    }
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".webp": "image/webp",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".wasm": "application/wasm",
    };
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": target.endsWith(".html")
        ? "no-cache"
        : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const port = Number(process.env.PORT || 5174);
server.listen(port, "0.0.0.0", () =>
  console.log(
    `THE UNFINISHED PORTRAIT http://localhost:${port} (${production ? "production" : "development"})`,
  ),
);
