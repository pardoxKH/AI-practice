// Permissions matrix from tracker-requirements.md, limited to what Phase 1 ships.
import type { Role } from "./domain";

export type Area = "opportunities" | "resources" | "users" | "settings" | "audit";
export type Access = "edit" | "view" | "none";

const MATRIX: Record<Area, Record<Role, Access>> = {
  opportunities: { Admin: "edit", "Project lead": "view", HR: "none", Leadership: "view" },
  resources: { Admin: "edit", "Project lead": "view", HR: "view", Leadership: "view" },
  users: { Admin: "edit", "Project lead": "none", HR: "none", Leadership: "none" },
  settings: { Admin: "edit", "Project lead": "none", HR: "none", Leadership: "none" },
  audit: { Admin: "view", "Project lead": "none", HR: "none", Leadership: "none" },
};

export const access = (role: Role, area: Area): Access => MATRIX[area][role];
export const canView = (role: Role, area: Area) => access(role, area) !== "none";
export const canEdit = (role: Role, area: Area) => access(role, area) === "edit";
