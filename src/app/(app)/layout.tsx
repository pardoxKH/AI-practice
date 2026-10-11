import { doSignOut } from "@/app/actions";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { Nav } from "@/components/Nav";
import { canView } from "@/lib/permissions";
import { displayCurrency, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ccy = await displayCurrency();
  const links = [
    { href: "/", label: "Overview" },
    ...(canView(user.role, "opportunities") ? [{ href: "/pipeline", label: "Pipeline" }] : []),
    { href: "/resources", label: "Resources" },
    ...(canView(user.role, "users") ? [{ href: "/admin/users", label: "Users" }] : []),
    ...(canView(user.role, "settings") ? [{ href: "/admin/settings", label: "Settings" }] : []),
    ...(canView(user.role, "audit") ? [{ href: "/admin/audit", label: "Audit trail" }] : []),
  ];
  const dummy = !process.env.SEED_DIR;
  return (
    <>
      <header className="topbar">
        <span className="brand">Applied AI Practice</span>
        <Nav links={links} />
        <div className="who">
          {dummy && <span className="badge dummy" title="Running on the DUMMY sample data in data/sample">Dummy data</span>}
          <CurrencyToggle current={ccy} />
          <span>
            {user.name} <span className="badge">{user.role}</span>
          </span>
          <form action={doSignOut}>
            <button className="btn link" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
