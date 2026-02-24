import { auth } from "./auth.js";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (!session) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require the "admin" role
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (session.user?.role !== "admin") {
      return NextResponse.redirect(
        new URL("/auth/login?error=AccessDenied", req.url),
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/chat/:path*",
    "/api/chat/:path*",
  ],
};
