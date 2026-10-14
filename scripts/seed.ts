// Validates the input tabs and (re)loads them into the database.
//   npm run db:seed                              -> validate SEED_DIR (or data/sample) and load it if the database is empty
//   npm run db:seed -- --reset                   -> replace the loaded tabs with the files' contents
//   npm run db:seed -- --dir path --check        -> validate a folder of CSVs (one per tab) only
//   npm run db:seed -- --file book.xlsx --check  -> validate a workbook (one sheet per tab) only
//   add --partial to load the rows that pass and list the ones skipped (for a workbook that is still in progress)
import { defaultDbPath, defaultSeedDir, loadTabs, openDb } from "../src/lib/db";
import { errorCount, loadCsvDir, type ImportResult, validateTabs } from "../src/lib/importer";
import { readWorkbook } from "../src/lib/xlsx";

const MAX_SHOWN = 15;

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const file = opt("--file");
  const source = file ?? opt("--dir") ?? defaultSeedDir();
  const { data, errors }: ImportResult = file ? validateTabs(await readWorkbook(file), file) : loadCsvDir(source);

  for (const [tab, rows] of Object.entries(data)) {
    const errs = errors[tab as keyof typeof errors];
    console.log(`${tab.padEnd(20)} ${String(rows.length).padStart(4)} rows ok  ${errs.length ? `${errs.length} problems` : ""}`);
    for (const e of errs.slice(0, MAX_SHOWN)) console.log(`    - ${e}`);
    if (errs.length > MAX_SHOWN) console.log(`    ... and ${errs.length - MAX_SHOWN} more`);
  }
  const partial = args.includes("--partial");
  if (errorCount(errors) && !partial) {
    console.error(`\nFix the problems above in ${source} (or add --partial to load only the rows that pass); nothing was loaded.`);
    process.exit(1);
  }
  if (args.includes("--check")) return;

  const db = openDb(defaultDbPath());
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0 && !args.includes("--reset")) {
    console.log(`\n${defaultDbPath()} already has data. Re-run with --reset to replace it with ${source}.`);
    return;
  }
  loadTabs(db, data, "seed-script", source);
  console.log(`\nLoaded ${source} into ${defaultDbPath()}${errorCount(errors) ? " (rows with problems were skipped)" : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
