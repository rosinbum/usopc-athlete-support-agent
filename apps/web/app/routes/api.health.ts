import type { Route } from "./+types/api.health.js";

export async function loader({ request }: Route.LoaderArgs) {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
