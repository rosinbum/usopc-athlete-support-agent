// Auth routes are handled by Express middleware in server/app.ts
// This file exists only to satisfy the route definition
import type { Route } from "./+types/api.auth.js";

export function loader({ request }: Route.LoaderArgs) {
  return Response.json(
    { error: "Auth routes are handled by middleware" },
    { status: 404 },
  );
}
