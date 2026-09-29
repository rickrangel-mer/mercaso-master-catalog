// Copies the built catalogs (dist/*.json at the repo root) into public/data and writes
// public/data/index.json listing them. Run `pnpm build` at the repo root first.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "../../../dist");
const out = join(here, "../public/data");

const files = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".json")).sort() : [];
if (files.length === 0) {
  console.error("No catalogs in dist/. Run `pnpm build` at the repo root first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const index = files.map((f) => {
  copyFileSync(join(dist, f), join(out, f));
  const { store_type, name } = JSON.parse(readFileSync(join(dist, f), "utf8"));
  return { store_type, name, file: f };
});
writeFileSync(join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Copied ${files.length} catalog(s) to public/data.`);
