import { doSignOut } from "@/app/actions";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { Nav } from "@/components/Nav";
import { getDb } from "@/lib/db";
import { canView } from "@/lib/permissions";
import { displayCurrency, requireUser } from "@/lib/session";
import { isDummyData } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ccy = await displayCurrency();
  const links = [
    { href: "/", label: "Overview" },
    ...(canView(user.role, "opportunities") ? [{ href: "/pipeline", label: "Pipeline" }] : []),
    ...(canView(user.role, "projects") ? [{ href: "/projects", label: "Projects" }] : []),
    { href: "/resources", label: "Resources" },
    { href: "/utilization", label: "Utilization" },
    ...(canView(user.role, "users") ? [{ href: "/admin/users", label: "Users" }] : []),
    ...(canView(user.role, "settings") ? [{ href: "/admin/settings", label: "Settings" }] : []),
    ...(canView(user.role, "audit") ? [{ href: "/admin/audit", label: "Audit trail" }] : []),
  ];
  const dummy = isDummyData(getDb());
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
