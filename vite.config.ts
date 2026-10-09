import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    // NestJS API (server/) during development
    proxy: { "/api": "http://localhost:3000" },
  },
  css: {
    modules: {
      localsConvention: "camelCase", // optional, changes the exported class names convention
    },
  },
});
