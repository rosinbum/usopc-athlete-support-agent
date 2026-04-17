import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { authHandler } from "./auth.js";

// Resolve paths relative to this file so the server works regardless of
// process.cwd() (Cloud Run runs `tsx apps/web/server/app.ts` from /app).
const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

const app = express();

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      `connect-src 'self' https:${isDev ? " ws:" : ""}`,
      "frame-ancestors 'none'",
    ].join("; "),
  );
  next();
});

// ---------------------------------------------------------------------------
// Health check — must be before the React Router catchall
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Auth.js routes — handles /api/auth/signin, /api/auth/callback, etc.
// ---------------------------------------------------------------------------

// Body parsing for auth form submissions (signin, csrf)
app.use("/api/auth", express.json(), express.urlencoded({ extended: true }));
app.all("/api/auth/*splat", authHandler);

// ---------------------------------------------------------------------------
// Dev vs Production setup
// ---------------------------------------------------------------------------

if (isDev) {
  // Dev: use Vite middleware mode so HMR works AND Express handles auth
  const vite = await import("vite");
  const viteServer = await vite.createServer({
    server: { middlewareMode: true },
  });
  app.use(viteServer.middlewares);
  app.all(
    "*splat",
    createRequestHandler({
      build: () =>
        viteServer.ssrLoadModule("virtual:react-router/server-build") as never,
    }),
  );
} else {
  // Production: serve static assets + pre-built server bundle
  app.use(express.static(resolve(webRoot, "build/client"), { maxAge: "1h" }));
  // The server build is produced by `react-router build` at deploy time and
  // doesn't exist during typecheck. Use a dynamic specifier so TS can't try
  // to resolve it statically.
  const serverBuildPath = resolve(webRoot, "build/server/index.js");
  app.all(
    "*splat",
    createRequestHandler({
      build: () => import(/* @vite-ignore */ serverBuildPath) as never,
    }),
  );
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
