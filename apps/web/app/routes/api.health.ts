import type { Route } from "./+types/api.health.js";
import { getAppVersion } from "../../server/version.js";

export async function loader({ request }: Route.LoaderArgs) {
  const { version, commit } = getAppVersion();
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version,
    commit,
  });
}
