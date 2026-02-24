import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import { createInviteEntity } from "@usopc/shared";
import {
  getAuthSecret,
  getGitHubClientId,
  getGitHubClientSecret,
  getAdminEmails,
  getResendApiKey,
} from "./lib/auth-env.js";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: getGitHubClientId(),
      clientSecret: getGitHubClientSecret(),
    }),
    Resend({
      apiKey: getResendApiKey(),
      from: "Athlete Support <noreply@usopc.org>",
    }),
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/auth/login" },
  secret: getAuthSecret(),
  trustHost: true,
  callbacks: {
    async signIn({ profile, user, account }) {
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      if (!email) return false;

      // GitHub OAuth: check admin allowlist
      if (account?.provider === "github") {
        const allowed = getAdminEmails();
        return allowed.includes(email);
      }

      // Email magic-link: check invite list in DynamoDB
      if (account?.provider === "resend") {
        const inviteEntity = createInviteEntity();
        return await inviteEntity.isInvited(email);
      }

      return false;
    },
    authorized({ auth }) {
      return !!auth;
    },
    async jwt({ token, profile, user, account }) {
      if (account) {
        // First sign-in: stamp role from provider
        token.role = account.provider === "github" ? "admin" : "athlete";
      }
      if (profile) {
        token.email = profile.email ?? null;
        token.name = profile.name ?? null;
        token.picture = (profile as Record<string, unknown>)
          .avatar_url as string;
      } else if (user?.email) {
        // Email provider: populate from user object
        token.email = user.email;
        token.name = user.name ?? user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
});
