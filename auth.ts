import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";

type AuthServiceLoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
};

async function loginViaAuthService(email: string, password: string) {
  const baseUrl = process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:3101";
  const res = await fetch(`${baseUrl}/auth/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!res.ok) return null;
  return (await res.json()) as AuthServiceLoginResponse;
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
    name: "Логин и пароль",
    credentials: {
      email: { label: "Логин", type: "email" },
      password: { label: "Пароль", type: "password" },
    },
    authorize: async (credentials) => {
      const email = credentials?.email;
      const password = credentials?.password;
      if (typeof email !== "string" || typeof password !== "string") {
        return null;
      }

      const login = await loginViaAuthService(email.trim(), password);
      if (!login) return null;

      return {
        id: login.user.id,
        name: login.user.name ?? "Admin",
        email: login.user.email,
        role: login.user.role,
        authAccessToken: login.accessToken,
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
    async jwt({ token, account, user }) {
      if (account?.provider === "google") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
      }
      if (account?.provider === "password") {
        const authUser = user as
          | { role?: string; authAccessToken?: string }
          | undefined;
        token.accessToken = authUser?.authAccessToken;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
        token.role = authUser?.role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      } else {
        session.accessToken = undefined;
      }
      session.user.role = (token.role as string | undefined) ?? "admin";
      return session;
    },
  },
});
