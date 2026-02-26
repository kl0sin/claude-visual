import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3200",
      "/ws": {
        target: "ws://localhost:3200",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
