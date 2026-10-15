import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { devLoginEnabled, domainAllowed, resolveUser } from "@/lib/access";
import { getDb } from "@/lib/db";

const providers: Provider[] = [Google];

// Demo-only: sign in as any user in the users tab without Google. Never enable in production.
if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Demo login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize(creds) {
        const user = resolveUser(getDb(), String(creds?.email ?? ""));
        return user ? { id: user.email, email: user.email, name: user.name } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  callbacks: {
    signIn({ user, account, profile }) {
      const email = user.email ?? "";
      if (account?.provider === "google" && profile?.email_verified === false) return false;
      return domainAllowed(email) && !!resolveUser(getDb(), email);
    },
  },
});
