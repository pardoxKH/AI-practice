// "Missing info": what the importer flagged on a row, plus placeholder dates standing in for real ones.
import { PLACEHOLDER_NOTE } from "./placeholders";

export function issuesOf(row: { data_issues: string; notes?: string }): string[] {
  const issues = row.data_issues ? row.data_issues.split("; ").filter(Boolean) : [];
  if (row.notes?.includes(PLACEHOLDER_NOTE)) issues.push("dates are placeholders, not real dates");
  return issues;
}

export const hasIssues = (row: { data_issues: string; notes?: string }) => issuesOf(row).length > 0;
