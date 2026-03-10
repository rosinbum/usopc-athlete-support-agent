import type { Session } from "next-auth";
import { signOut } from "../../auth.js";

export default function AdminNav({ session }: { session: Session }) {
  const user = session.user;

  return (
    <nav className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b px-4 sm:px-6 py-3 bg-white gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
        <a href="/admin" className="text-lg font-semibold">
          Admin Dashboard
        </a>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <a
            href="/admin/sources"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sources
          </a>
          <a
            href="/admin/discoveries"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Discoveries
          </a>
          <a
            href="/admin/invites"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Invites
          </a>
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Site
          </a>
        </div>
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
          <span className="text-sm text-gray-600 hidden sm:inline">
            {user?.email}
          </span>
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
