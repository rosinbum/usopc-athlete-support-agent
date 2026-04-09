import { ExpressAuth, type ExpressAuthConfig } from "@auth/express";
import GitHub from "@auth/express/providers/github";
import Resend from "@auth/express/providers/resend";
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
} from "../lib/auth-env.js";

const dynamoClient = DynamoDBDocument.from(new DynamoDB(), {
  marshallOptions: {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

export const authConfig: ExpressAuthConfig = {
  adapter: DynamoDBAdapter(dynamoClient, {
    tableName: getResource("AuthTable").name,
  }),
  providers: [
    GitHub({
      clientId: getGitHubClientId(),
      clientSecret: getGitHubClientSecret(),
    }),
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
 * Express middleware for Auth.js routes.
 * Mount at "/api/auth" to handle /api/auth/signin, /api/auth/callback, etc.
 */
export const authHandler = ExpressAuth(authConfig);
