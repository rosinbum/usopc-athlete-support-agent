import { redirect } from "react-router";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/auth.login";
import { getSession } from "../../server/session.js";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl") ?? "/admin";
  if (session?.user?.email) {
    // Don't redirect non-admin users to admin pages — they'd just bounce back
    const isAdminUrl = callbackUrl.startsWith("/admin");
    const isAdmin = (session.user as Record<string, unknown>).role === "admin";
    if (isAdminUrl && !isAdmin) {
      return redirect("/");
    }
    return redirect(callbackUrl);
  }
  return {};
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken));
  }, []);

  // Determine if this is a chat login (redirect back to chat instead of admin)
  const isChatLogin = callbackUrl.startsWith("/chat");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-usopc-gray-50 px-4">
      <div className="max-w-sm w-full space-y-6 p-6 sm:p-8 bg-white rounded-lg shadow border-t-4 border-usopc-navy">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-usopc-navy">
            {isChatLogin ? "Sign In to Chat" : "Admin Login"}
          </h1>
          <p className="text-usopc-gray-500 mt-2 text-sm">
            {isChatLogin
              ? "Sign in with your GitHub account or email."
              : "Sign in with your authorized GitHub account or email."}
          </p>
        </div>

        {error === "AccessDenied" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
            Access denied. Your email is not on the invite list.
          </div>
        )}

        {error === "Verification" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
            The magic link has expired or already been used. Please request a
            new one.
          </div>
        )}

        {error && error !== "AccessDenied" && error !== "Verification" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
            An error occurred during sign in. Please try again.
          </div>
        )}

        {/* Email magic-link form */}
        <form
          method="post"
          action="/api/auth/signin/resend"
          className="space-y-3"
        >
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-usopc-gray-700 mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full border border-usopc-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-usopc-navy"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-usopc-navy text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-usopc-navy-light transition-colors"
          >
            Send magic link
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-usopc-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-usopc-gray-500">or</span>
          </div>
        </div>

        {/* GitHub OAuth */}
        <form method="post" action="/api/auth/signin/github">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-white border border-usopc-gray-300 rounded-md px-4 py-2 text-sm font-medium text-usopc-gray-700 hover:bg-usopc-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
