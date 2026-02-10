import type { Session } from "next-auth";
import { signOut } from "../../auth.js";

export default function AdminNav({ session }: { session: Session }) {
  const user = session.user;

  return (
    <nav className="flex items-center justify-between border-b px-6 py-3 bg-white">
      <div className="flex items-center gap-6">
        <a href="/admin" className="text-lg font-semibold">
          Admin Dashboard
        </a>
        <a
          href="/admin/sources"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sources
        </a>
        <a
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Back to Site
        </a>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user?.image && (
            <img
              src={user.image}
              alt=""
              className="w-7 h-7 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="text-sm text-gray-600">{user?.email}</span>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
