import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // ESM .js extension resolution — mirrors the webpack extensionAlias from next.config.ts
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  // Load .env.local from the monorepo root
  envDir: "../..",
  server: {
    port: 3000,
  },
  ssr: {
    noExternal: ["@usopc/shared", "@usopc/core"],
  },
});
