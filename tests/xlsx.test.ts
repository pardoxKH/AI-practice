import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { validateTabs } from "@/lib/importer";
import { readWorkbook } from "@/lib/xlsx";

describe("workbook loader", () => {
  it("reads one sheet per tab, formats dates, trims text and ignores blank rows and unnamed columns", async () => {
    const wb = new ExcelJS.Workbook();
    const users = wb.addWorksheet("users");
    users.addRow(["email", "name", "role", null]);
    users.addRow(["a@b.com", "A", "Admin ", "stray"]);
    users.addRow([null, null, null, null]);
    const profiles = wb.addWorksheet("profiles");
    profiles.addRow(["profile", "description"]);
    profiles.addRow(["ML Engineer", ""]);
    const res = wb.addWorksheet("resources");
    res.addRow(["resource_id", "full_name", "email", "employment_type", "profile", "seniority", "skills", "line_manager", "join_date", "status"]);
    res.addRow(["R001", "A", "a@b.com", "FTE", "ML Engineer", null, null, null, new Date(Date.UTC(2025, 2, 1)), "Active"]);
    wb.addWorksheet("README").addRow(["ignored"]);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wb-")), "book.xlsx");
    await wb.xlsx.writeFile(file);

    const raw = await readWorkbook(file);
    expect(raw.users).toEqual([{ email: "a@b.com", name: "A", role: "Admin" }]);
    expect(raw.resources?.[0].join_date).toBe("2025-03-01");
    const { errors } = validateTabs(raw, file);
    expect(errors.users).toEqual([]);
    expect(errors.opportunities).toEqual([`tab "opportunities" not found in ${file}`]);
  });
});
