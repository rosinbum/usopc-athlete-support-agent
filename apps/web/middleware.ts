export { auth as middleware } from "./auth.js";

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/chat/:path*",
    "/api/chat/:path*",
  ],
};
