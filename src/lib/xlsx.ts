// Reads the input workbook (one sheet per tab, headers in row 1) into the same row shape as the CSV loader,
// so the real data can be loaded straight from the .xlsx Tariq keeps on his machine.
import ExcelJS from "exceljs";
import { dropBlankRows, TABS, type TabName } from "./importer";

const pad = (n: number) => String(n).padStart(2, "0");

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue); // formula
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text); // hyperlink
    if ("error" in value) return "";
  }
  return String(value).trim();
}

export async function readWorkbook(file: string): Promise<Partial<Record<TabName, Record<string, string>[]>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Partial<Record<TabName, Record<string, string>[]>> = {};
  for (const sheet of wb.worksheets) {
    const tab = sheet.name.trim() as TabName;
    if (!TABS.includes(tab)) continue;
    const header: (string | null)[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col] = cellText(cell.value) || null;
    });
    const rows: Record<string, string>[] = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const rec: Record<string, string> = {};
      header.forEach((h, col) => {
        if (h) rec[h] = cellText(row.getCell(col).value);
      });
      rows.push(rec);
    });
    out[tab] = dropBlankRows(rows);
  }
  return out;
}
