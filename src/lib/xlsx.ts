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

type Source = string | ArrayBuffer;

async function open(file: Source) {
  const wb = new ExcelJS.Workbook();
  if (typeof file === "string") await wb.xlsx.readFile(file);
  else await wb.xlsx.load(file);
  return wb;
}

function sheetRows(sheet: ExcelJS.Worksheet): Record<string, string>[] {
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
  return dropBlankRows(rows);
}

export async function readWorkbook(file: Source): Promise<Partial<Record<TabName, Record<string, string>[]>>> {
  const wb = await open(file);
  const out: Partial<Record<TabName, Record<string, string>[]>> = {};
  for (const sheet of wb.worksheets) {
    const tab = sheet.name.trim() as TabName;
    if (TABS.includes(tab)) out[tab] = sheetRows(sheet);
  }
  return out;
}

/** Rows of the sheet named `tab`, or of the first sheet when there is none (e.g. a standalone ops report). */
export async function readSheet(file: Source, tab: TabName): Promise<Record<string, string>[]> {
  const wb = await open(file);
  const sheet = wb.worksheets.find((w) => w.name.trim() === tab) ?? wb.worksheets[0];
  return sheet ? sheetRows(sheet) : [];
}
