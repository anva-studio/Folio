import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { availableParallelism } from 'node:os';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "folio-android-viewport",
      transformIndexHtml(html) {
        // Let Capacitor inset the entire Android WebView around system bars.
        return mode === "android" ? html.replace(", viewport-fit=cover", "") : html;
      },
    },
  ],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  test: {
    // Bound concurrent browser simulators and real KDF jobs on developer/CI hosts.
    maxWorkers: Math.min(4, availableParallelism()),
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts", "test/**/*.test.tsx"],
  },
}));

