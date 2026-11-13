#!/usr/bin/env node
// Valida todos os digests do repo de conteúdo. Qualquer erro aborta o build,
// e o site publicado continua sendo a última versão boa.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { validateFile } from "./validate-digest.mjs";
import { digestsDir } from "./content-dir.mjs";

const dir = digestsDir();
const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!files.length) {
  console.error(`Nenhum digest em ${dir}`);
  process.exit(1);
}
let failed = 0;
for (const f of files) {
  const errors = validateFile(join(dir, f));
  if (errors.length) {
    failed++;
    console.error(`✗ ${f}`);
    errors.forEach((e) => console.error(`   - ${e}`));
  }
}
console.log(`${files.length - failed}/${files.length} digests válidos (${dir})`);
process.exit(failed ? 1 : 0);
