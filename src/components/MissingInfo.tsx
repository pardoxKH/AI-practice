import { issuesOf } from "@/lib/issues";

type Row = { data_issues: string; notes?: string };

/** Small flag for tables; hover lists what is missing. Renders nothing for a complete row. */
export function MissingInfoFlag({ row }: { row: Row }) {
  const issues = issuesOf(row);
  if (!issues.length) return null;
  return (
    <span className="flag missing" title={`Missing info:\n${issues.join("\n")}`}>
      <span aria-hidden>⚠ </span>Missing info
    </span>
  );
}

/** Notice for a detail page listing each gap, so it can be fixed in the workbook or in the app. */
export function MissingInfoNotice({ row, fixHint }: { row: Row; fixHint: string }) {
  const issues = issuesOf(row);
  if (!issues.length) return null;
  return (
    <div className="notice missing" role="note">
      <strong><span aria-hidden>⚠ </span>Missing information.</strong> Shown anyway so it stays visible; figures that depend on these fields may be off.
      <ul className="small" style={{ margin: "6px 0 0" }}>
        {issues.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <div className="small muted" style={{ marginTop: 6 }}>{fixHint}</div>
    </div>
  );
}
