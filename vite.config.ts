import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // NestJS API (server/) during development
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  css: {
    modules: {
      localsConvention: "camelCase", // optional, changes the exported class names convention
    },
  },
});
