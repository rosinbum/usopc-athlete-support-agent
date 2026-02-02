import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";

const app = new Hono();

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
