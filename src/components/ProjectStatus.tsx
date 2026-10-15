import type { ProjectStatus as Status } from "@/lib/domain";

const LOOK: Record<Status, { cls: string; icon: string }> = {
  "On track": { cls: "Green", icon: "✓" },
  "At risk": { cls: "Amber", icon: "!" },
  "Off track": { cls: "Red", icon: "✕" },
  Completed: { cls: "Pending", icon: "■" },
  "On hold": { cls: "Pending", icon: "‖" },
  Draft: { cls: "Pending", icon: "…" },
};

/** Project status with its colour, an icon and the label, so it never relies on colour alone. */
export function ProjectStatus({ status, draft }: { status: Status; draft?: boolean }) {
  const s: Status = draft ? "Draft" : status;
  const look = LOOK[s] ?? LOOK.Draft;
  return (
    <span className={`rag ${look.cls}`} style={{ whiteSpace: "nowrap" }}>
      <span className="dot" aria-hidden />
      <span aria-hidden>{look.icon}</span>
      {s}
    </span>
  );
}
