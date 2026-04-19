import { Outlet } from "react-router";
import type { Route } from "./+types/admin";
import { getAdminSession, requireAdmin } from "../../server/session.js";
import { getAppVersion } from "../../server/version.js";
import AdminNav from "../../components/admin/AdminNav.js";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getAdminSession(request);
  requireAdmin(session);
  return { session, version: getAppVersion() };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen">
      <AdminNav session={loaderData.session} version={loaderData.version} />
      <main className="p-8">
        <Outlet />
      </main>
    </div>
  );
}
