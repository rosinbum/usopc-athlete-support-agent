import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/aws-lambda";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";

const app = new Hono();

// CORS — restrict to the web app origin in production (ALLOWED_ORIGIN env var),
// or allow all origins in local dev (when the env var is not set).
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";
app.use(
  "*",
  cors({
    origin: allowedOrigin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.all("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext({ req: c.req.raw }),
  });
  return response;
});

app.all("/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext({ req: c.req.raw }),
  });
  return response;
});

export const handler = handle(app);
