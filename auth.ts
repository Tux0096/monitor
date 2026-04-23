import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { timingSafeEqual } from "node:crypto";
import { authConfig } from "./auth.config";

function verifyPassword(input: string): boolean {
  const expected = process.env.AUTH_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const googleConfigured =
  Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

const providers = [
  ...(googleConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorization: {
            params: {
              prompt: "consent",
              access_type: "offline",
              scope: [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/cloud-platform.read-only",
                "https://www.googleapis.com/auth/firebase",
                "https://www.googleapis.com/auth/analytics.readonly",
              ].join(" "),
            },
          },
        }),
      ]
    : []),
  Credentials({
    id: "password",
    name: "Пароль",
    credentials: {
      password: { label: "Пароль", type: "password" },
    },
    authorize: async (credentials) => {
      const p = credentials?.password;
      if (typeof p !== "string" || !verifyPassword(p)) return null;
      return {
        id: "password",
        name: "Доступ по паролю",
        email: "local@dashboard.internal",
      };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers,
  trustHost: true,
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
      }
      if (account?.provider === "password") {
        token.accessToken = undefined;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      } else {
        session.accessToken = undefined;
      }
      return session;
    },
  },
});
