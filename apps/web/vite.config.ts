import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // ESM .js extension resolution — mirrors the webpack extensionAlias from next.config.ts
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  server: {
    port: 3000,
  },
  ssr: {
    // Don't bundle SST — it reads env vars at runtime
    noExternal: ["@usopc/shared", "@usopc/core"],
    external: ["sst"],
  },
});
