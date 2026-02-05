import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  getAuthSecret,
  getGoogleClientId,
  getGoogleClientSecret,
  getAdminEmails,
} from "./lib/auth-env.js";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: getGoogleClientId(),
      clientSecret: getGoogleClientSecret(),
    }),
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/auth/login" },
  secret: getAuthSecret(),
  trustHost: true,
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false;
      const allowed = getAdminEmails();
      return allowed.includes(profile.email.toLowerCase());
    },
    authorized({ auth }) {
      return !!auth;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
