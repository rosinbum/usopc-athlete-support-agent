import { Auth } from "@auth/core";
import type { AuthConfig } from "@auth/core";
import GitHub from "@auth/express/providers/github";
import Resend from "@auth/express/providers/resend";
import type { Provider } from "@auth/core/providers";
import PostgresAdapter from "@auth/pg-adapter";
import type { Request, Response, NextFunction } from "express";
import { createInviteEntity, getPool } from "@usopc/shared";
import {
  getAuthSecret,
  getGitHubClientId,
  getGitHubClientSecret,
  getAdminEmails,
  getResendApiKey,
} from "../lib/auth-env.js";

export const authConfig: AuthConfig = {
  basePath: "/api/auth",
  adapter: PostgresAdapter(getPool()),
  providers: [
    GitHub({
      clientId: getGitHubClientId(),
      clientSecret: getGitHubClientSecret(),
    }),
    Resend({
      apiKey: getResendApiKey(),
      from: process.env.EMAIL_FROM ?? "Athlete Support <noreply@localhost>",
    }),
  ] as Provider[],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/auth/login" },
  secret: getAuthSecret(),
  trustHost: true,
  callbacks: {
    async signIn({ profile, user, account }) {
      const email = (
        (profile?.email ?? user?.email ?? "") as string
      ).toLowerCase();
      if (!email) return false;

      if (account?.provider === "github") {
        const allowed = getAdminEmails();
        return allowed.includes(email);
      }

      if (account?.provider === "resend") {
        const inviteEntity = createInviteEntity();
        return await inviteEntity.isInvited(email);
      }

      return false;
    },
    async jwt({ token, profile, user, account }) {
      if (account) {
        token.provider = account.provider;
      }
      if (profile) {
        token.email = profile.email ?? null;
        token.name = profile.name ?? null;
        token.picture = (profile as Record<string, unknown>)
          .avatar_url as string;
      } else if (user?.email) {
        token.email = user.email;
        token.name = user.name ?? user.email;
      }

      const email = ((token.email as string) ?? "").toLowerCase();
      if (token.provider === "github" && email) {
        const adminEmails = getAdminEmails();
        token.role = adminEmails.includes(email) ? "admin" : "athlete";
      } else if (token.provider === "resend") {
        token.role = "athlete";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
        if (token.role)
          (session.user as unknown as Record<string, unknown>).role =
            token.role;
      }
      return session;
    },
  },
};

/**
 * Convert Express request body to the format Auth expects.
 */
function encodeBody(req: Request): string | undefined {
  if (!req.body || req.method === "GET" || req.method === "HEAD")
    return undefined;
  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new URLSearchParams(req.body).toString();
  }
  if (contentType.includes("application/json")) {
    return JSON.stringify(req.body);
  }
  return undefined;
}

/**
 * Express middleware that calls @auth/core directly.
 * We avoid @auth/express's ExpressAuth because its toExpressResponse
 * has issues with Set-Cookie headers on Express 5.
 */
export async function authHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  try {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3000";
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Build Web Request from Express request
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.append(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (v) headers.append(key, v);
        }
      }
    }

    const reqBody = encodeBody(req);
    const webRequest = new Request(url, {
      method: req.method,
      headers,
      ...(reqBody !== undefined && { body: reqBody }),
    });

    // Call Auth.js core
    const webResponse = await Auth(webRequest, authConfig);

    // Convert Web Response to Express response
    // Handle Set-Cookie specially via getSetCookie()
    res.status(webResponse.status);

    for (const [key, value] of webResponse.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") continue; // handle below
      res.setHeader(key, value);
    }

    // Set cookies individually using getSetCookie()
    const cookies = webResponse.headers.getSetCookie();
    for (const cookie of cookies) {
      res.appendHeader("set-cookie", cookie);
    }

    // Send body
    const body = await webResponse.text();
    if (body) {
      res.send(body);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("[auth] Handler error:", error);
    res.status(500).json({ error: "Internal auth error" });
  }
}
