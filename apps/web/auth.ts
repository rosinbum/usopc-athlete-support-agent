import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import { DynamoDBAdapter } from "@auth/dynamodb-adapter";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { createInviteEntity, getResource } from "@usopc/shared";
import {
  getAuthSecret,
  getGitHubClientId,
  getGitHubClientSecret,
  getAdminEmails,
  getResendApiKey,
} from "./lib/auth-env.js";

const dynamoClient = DynamoDBDocument.from(new DynamoDB(), {
  marshallOptions: {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DynamoDBAdapter(dynamoClient, {
    tableName: getResource("AuthTable").name,
  }),
  providers: [
    GitHub({
      clientId: getGitHubClientId(),
      clientSecret: getGitHubClientSecret(),
    }),
    // TODO: consider a dedicated reply-to domain separate from the webhost (#397)
    Resend({
      apiKey: getResendApiKey(),
      from: process.env.EMAIL_FROM ?? "Athlete Support <noreply@localhost>",
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
        token.provider = account.provider;
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

      // Re-evaluate role on every token refresh (not just first sign-in).
      // This ensures removed admins lose access promptly instead of retaining
      // a stale role for the full 24-hour JWT lifetime.
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
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
});
