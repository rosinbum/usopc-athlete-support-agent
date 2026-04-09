import express from "express";
import { createRequestHandler } from "@react-router/express";
import { authHandler } from "./auth.js";

const app = express();

// Security headers
const isDev = process.env.NODE_ENV === "development";
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
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  next();
});

// Auth.js routes — handles /api/auth/signin, /api/auth/callback, etc.
app.use("/api/auth/*", authHandler);

// Static assets from the React Router client build
app.use(express.static("build/client", { maxAge: "1h" }));

// React Router SSR handler — catches everything else
app.all(
  "*",
  createRequestHandler({ build: () => import("../build/server/index.js") }),
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
