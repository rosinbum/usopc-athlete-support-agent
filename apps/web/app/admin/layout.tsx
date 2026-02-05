import { redirect } from "next/navigation";
import { auth } from "../../auth.js";
import AdminNav from "../../components/admin/AdminNav.js";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div className="min-h-screen">
      <AdminNav session={session} />
      <main className="p-8">{children}</main>
    </div>
  );
}
