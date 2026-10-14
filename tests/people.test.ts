import { describe, expect, it } from "vitest";
import type { Assignment, Opportunity, Project, Resource, UtilizationRow } from "@/lib/domain";
import {
  allocationInWeek,
  defaultPeriodType,
  engagementSplit,
  overAllocations,
  peopleHealth,
  planGrid,
  practiceUtilization,
  underUtilized,
  unknownEmails,
  weeksFrom,
} from "@/lib/people";

const res = (id: string, p: Partial<Resource> = {}): Resource => ({
  resource_id: id,
  full_name: id,
  email: `${id.toLowerCase()}@firm.com`,
  employment_type: "FTE",
  profile: "ML Engineer",
  seniority: "",
  skills: "",
  line_manager: "",
  join_date: "",
  status: "Active",
  ...p,
});

let n = 0;
const asg = (resource_id: string, pct: number, from: string, to: string, link: Partial<Assignment> = { project_id: "P1" }): Assignment => ({
  id: ++n,
  project_id: "",
  opportunity_id: "",
  resource_id,
  role_on_project: "x",
  allocation_pct: pct,
  assigned_from: from,
  assigned_to: to,
  ...link,
});

describe("planned allocation", () => {
  it("lists Mondays from the week containing the date", () => {
    expect(weeksFrom("2026-10-14", 3)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("counts an assignment in every week it overlaps", () => {
    const a = [asg("R1", 50, "2026-10-16", "2026-10-20"), asg("R1", 30, "2026-10-01", "2026-12-31")];
    expect(allocationInWeek(a, "R1", "2026-10-12")).toBe(80);
    expect(allocationInWeek(a, "R1", "2026-10-19")).toBe(80);
    expect(allocationInWeek(a, "R1", "2026-10-26")).toBe(30);
  });

  it("flags anyone planned above 100% and skips people on leave", () => {
    const people = [res("R1"), res("R2"), res("R3", { status: "On leave" })];
    const a = [asg("R1", 80, "2026-10-01", "2026-12-31"), asg("R1", 40, "2026-11-02", "2026-11-15"), asg("R3", 150, "2026-10-01", "2026-12-31")];
    const weeks = weeksFrom("2026-10-14", 12);
    const over = overAllocations(people, a, weeks);
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ firstWeek: "2026-11-02", peakPct: 120, weeksOver: 2 });
    expect(planGrid(people, a, weeks).map((r) => r.freeNow)).toEqual([20, 100]);
  });
});

describe("engagement split", () => {
  const projects = [
    { project_id: "P1", project_type: "Client", client_name: "Acme" },
    { project_id: "P2", project_type: "Accelerator", client_name: "Internal" },
  ] as Project[];
  const opps = [{ opportunity_id: "O1", client_name: "Gulf Bank" }] as Opportunity[];

  it("maps projects, accelerators and opportunities to engagement types, the rest is bench", () => {
    const people = [res("R1"), res("R2"), res("R3")];
    const a = [
      asg("R1", 60, "2026-10-01", "2026-12-31", { project_id: "P1" }),
      asg("R1", 20, "2026-10-01", "2026-12-31", { opportunity_id: "O1" }),
      asg("R2", 100, "2026-10-01", "2026-12-31", { project_id: "P2" }),
    ];
    const s = engagementSplit(people, a, projects, opps, "2026-10-12");
    expect(s.byEngagement).toEqual({ Project: 0.6, Investment: 1, Presales: 0.2, Bench: 1.2 });
    expect(s.byClient[0]).toEqual({ client: "Internal", engagement: "Investment", fte: 1 });
    expect(s.byClient.find((c) => c.engagement === "Presales")?.client).toBe("Gulf Bank");
  });

  it("scales an over-allocated person down to one FTE", () => {
    const a = [asg("R1", 100, "2026-10-01", "2026-12-31", { project_id: "P1" }), asg("R1", 100, "2026-10-01", "2026-12-31", { project_id: "P2" })];
    const s = engagementSplit([res("R1")], a, projects, opps, "2026-10-12");
    expect(s.byEngagement).toEqual({ Project: 0.5, Investment: 0.5, Presales: 0, Bench: 0 });
  });
});

describe("utilization from the ops report", () => {
  const u = (email: string, period_start: string, utilization_pct: number, period_type: "Week" | "Month" = "Week"): UtilizationRow => ({
    email,
    period_type,
    period_start,
    utilization_pct,
  });
  const people = [res("R1"), res("R2"), res("T1", { employment_type: "Trainee" }), res("X1", { status: "Exited" })];
  const rows = [
    u("r1@firm.com", "2026-10-05", 90),
    u("r2@firm.com", "2026-10-05", 40),
    u("t1@firm.com", "2026-10-05", 10),
    u("x1@firm.com", "2026-10-05", 0),
    u("r1@firm.com", "2026-09-28", 50),
    u("ghost@firm.com", "2026-10-05", 70),
  ];

  it("averages FTEs in the latest period, leaving out trainees and leavers", () => {
    expect(practiceUtilization(rows, people, "Week")).toEqual({ pct: 65, period: "2026-10-05", people: 2 });
    expect(practiceUtilization(rows, people, "Month")).toEqual({ pct: null, period: null, people: 0 });
  });

  it("lists people below the threshold, trainees included", () => {
    expect(underUtilized(rows, people, { underutilized_below_pct: 50 }, "Week", "2026-10-05").map((x) => x.resource.resource_id)).toEqual(["T1", "R2"]);
  });

  it("reports emails that match nobody", () => {
    expect(unknownEmails(rows, people)).toEqual(["ghost@firm.com"]);
  });

  it("prefers weekly data", () => {
    expect(defaultPeriodType([u("a@x.com", "2026-10-01", 1, "Month")])).toBe("Month");
    expect(defaultPeriodType(rows)).toBe("Week");
  });

  it("rates people health against the target", () => {
    const s = { utilization_target_pct: 80 };
    expect(peopleHealth({ pct: 82, period: "p", people: 1 }, s).rag).toBe("Green");
    expect(peopleHealth({ pct: 72, period: "p", people: 1 }, s).rag).toBe("Amber");
    expect(peopleHealth({ pct: 69, period: "p", people: 1 }, s).rag).toBe("Red");
    expect(peopleHealth({ pct: null, period: null, people: 0 }, s).rag).toBe("Pending");
  });
});
