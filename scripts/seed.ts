// Validates the input tabs and (re)loads them into the database.
//   npm run db:seed                      -> validate SEED_DIR (or data/sample) and load it if the database is empty
//   npm run db:seed -- --reset           -> replace the loaded tabs with the files' contents
//   npm run db:seed -- --dir path --check -> validate only, print errors per tab
import { defaultDbPath, defaultSeedDir, loadTabs, openDb } from "../src/lib/db";
import { errorCount, loadCsvDir } from "../src/lib/importer";

const args = process.argv.slice(2);
const dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : defaultSeedDir();
const { data, errors } = loadCsvDir(dir);

for (const [tab, rows] of Object.entries(data)) {
  const errs = errors[tab as keyof typeof errors];
  console.log(`${tab.padEnd(14)} ${String(rows.length).padStart(4)} rows  ${errs.length ? `${errs.length} errors` : "ok"}`);
  for (const e of errs) console.log(`    - ${e}`);
}
if (errorCount(errors)) {
  console.error(`\nFix the errors above in ${dir}; nothing was loaded.`);
  process.exit(1);
}
if (args.includes("--check")) process.exit(0);

const db = openDb(defaultDbPath());
const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
if (n > 0 && !args.includes("--reset")) {
  console.log(`\n${defaultDbPath()} already has data. Re-run with --reset to replace it with ${dir}.`);
} else {
  loadTabs(db, data, "seed-script", dir);
  console.log(`\nLoaded ${dir} into ${defaultDbPath()}.`);
}
