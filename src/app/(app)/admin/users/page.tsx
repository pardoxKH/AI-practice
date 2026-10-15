import { deleteUserAction } from "@/app/actions";
import { UserForm } from "@/components/UserForm";
import { getDb } from "@/lib/db";
import { ROLES } from "@/lib/domain";
import { requireView } from "@/lib/session";
import { listUsers } from "@/lib/store";

const ROLE_HELP: Record<(typeof ROLES)[number], string> = {
  Admin: "Edits everything: pipeline, people, users, settings",
  "Project lead": "Views pipeline and people; edits own projects from Phase 2",
  HR: "Views people; edits hiring from Phase 3. No pipeline access",
  Leadership: "Read-only across the tracker",
};

export default async function Users({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const me = await requireView("users");
  const { edit } = await searchParams;
  const users = listUsers(getDb());
  return (
    <>
      <h1>Users and roles</h1>
      <p className="sub">Only people listed here can sign in with Google.</p>
      <div className="card">
        <h2>Add a user</h2>
        <UserForm />
        <ul className="small muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
          {ROLES.map((r) => <li key={r}><b>{r}:</b> {ROLE_HELP[r]}</li>)}
        </ul>
      </div>
      <div className="card section table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {users.map((u) =>
              edit === u.email ? (
                <tr key={u.email}><td colSpan={4}><UserForm user={u} /></td></tr>
              ) : (
                <tr key={u.email}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="badge">{u.role}</span></td>
                  <td className="actions" style={{ justifyContent: "end" }}>
                    <a href={`?edit=${encodeURIComponent(u.email)}`}>Edit</a>
                    {u.email !== me.email && (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="email" value={u.email} />
                        <button className="btn link danger" type="submit">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
