import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  publicDir: "public-portrait",
  server: { host: "0.0.0.0", port: 5174 },
});
