import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 5174 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("@mediapipe/tasks-vision")
            ? "vision"
            : id.includes("/three/")
              ? "three"
              : undefined,
      },
    },
  },
});
