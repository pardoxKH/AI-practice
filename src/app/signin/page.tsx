import { redirect } from "next/navigation";
import { devSignIn, googleSignIn } from "@/app/actions";
import { auth } from "@/auth";
import { devLoginEnabled, resolveUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { listUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Google account isn't on the tracker's user list. Ask the admin to add you.",
  Configuration: "Sign-in isn't configured yet. Check the Google OAuth settings.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await auth();
  if (session?.user?.email && resolveUser(getDb(), session.user.email) && !error) redirect("/");
  const dev = devLoginEnabled();
  const users = dev ? listUsers(getDb()) : [];
  return (
    <main className="signin">
      <div className="card">
        <h1>Applied AI Practice Tracker</h1>
        <p className="sub">Sign in with your company Google account.</p>
        {error && <div className="notice err">{ERRORS[error] ?? "Sign-in failed. Try again."}</div>}
        <form action={googleSignIn}>
          <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            Continue with Google
          </button>
        </form>
        {dev && (
          <form action={devSignIn} className="stack" style={{ marginTop: 24 }}>
            <label className="f">
              Demo login (dummy data only)
              <select name="email" defaultValue={users.find((u) => u.role === "Admin")?.email}>
                {users.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} · {u.role}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">Sign in as this user</button>
          </form>
        )}
      </div>
    </main>
  );
}
