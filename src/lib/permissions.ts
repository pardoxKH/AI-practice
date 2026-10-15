// Permissions matrix from tracker-requirements.md, limited to what Phases 1 and 2 ship.
import type { Project, Role, User } from "./domain";

export type Area = "opportunities" | "projects" | "resources" | "utilization" | "users" | "settings" | "audit";
export type Access = "edit" | "view" | "none";

// Project leads have "edit" on projects, but only their own (see canEditProject); utilization
// "edit" means loading the ops report.
const MATRIX: Record<Area, Record<Role, Access>> = {
  opportunities: { Admin: "edit", "Project lead": "view", HR: "none", Leadership: "view" },
  projects: { Admin: "edit", "Project lead": "edit", HR: "none", Leadership: "view" },
  resources: { Admin: "edit", "Project lead": "view", HR: "view", Leadership: "view" },
  utilization: { Admin: "edit", "Project lead": "view", HR: "view", Leadership: "view" },
  users: { Admin: "edit", "Project lead": "none", HR: "none", Leadership: "none" },
  settings: { Admin: "edit", "Project lead": "none", HR: "none", Leadership: "none" },
  audit: { Admin: "view", "Project lead": "none", HR: "none", Leadership: "none" },
};

export const access = (role: Role, area: Area): Access => MATRIX[area][role];
export const canView = (role: Role, area: Area) => access(role, area) !== "none";
export const canEdit = (role: Role, area: Area) => access(role, area) === "edit";

const isLeadOf = (user: User, p: Pick<Project, "project_lead_email">) =>
  user.role === "Project lead" && p.project_lead_email.toLowerCase() === user.email.toLowerCase();

/** Status, progress, weekly updates, milestones and team: Admin, or the project's own lead. */
export const canEditProject = (user: User, p: Pick<Project, "project_lead_email">) => user.role === "Admin" || isLeadOf(user, p);

/** Value, cost and margin: Admin and Leadership see all; a project lead sees only their own projects. */
export const canSeeFinancials = (user: User, p: Pick<Project, "project_lead_email">) =>
  user.role === "Admin" || user.role === "Leadership" || isLeadOf(user, p);

/** Only the admin edits project details and financials, creates projects and completes drafts. */
export const canManageProjects = (user: User) => user.role === "Admin";
