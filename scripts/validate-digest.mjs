#!/usr/bin/env node
// Valida digests/AAAA-MM-DD.json contra o contrato (schemaVersion 1).
// Sem dependências: roda com `node` puro, sem npm install.
//
// Uso:
//   node scripts/validate-digest.mjs digests/2026-11-14.json   # um arquivo
//   node scripts/validate-digest.mjs content/digests            # todos de uma pasta
//   node scripts/validate-digest.mjs                            # todos em digests/
//
// Sai com código 1 se houver qualquer erro.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIGESTS_DIR = join(ROOT, "digests");

export const SECTIONS = ["ia", "linguagens", "mercado", "seguranca", "brasil"];

const LIMITS = {
  tldrMin: 3,
  tldrMax: 5,
  tldrText: 400,
  itemsMin: 10,
  itemsMax: 20,
  title: 160,
  summary: 1200,
  whyItMatters: 300,
  sourceName: 80,
  url: 2048,
  sourcesMax: 5,
  tagsMax: 8,
  tag: 40,
  whatChanged: 300,
  toReadMax: 10,
  toReadNote: 300,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Tags HTML conhecidas, handlers e esquemas perigosos. Genéricos como `Result<T, !>`
// continuam permitidos. O site sempre renderiza como texto; isto é defesa extra.
const HTML_RE = /<\s*\/?\s*(script|iframe|img|svg|math|a|style|object|embed|link|meta|form|input|button|body|html|head|div|span|p|br|base|video|audio|source|template)\b|<!--|\bon[a-z]+\s*=|javascript:|data:text\/html/i;
// Controle exceto \n (parágrafos são permitidos em summary).
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;

export function normalizeTag(tag) {
  return String(tag)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isHttpsUrl(s) {
  if (typeof s !== "string" || s.length > LIMITS.url) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Retorna a lista de erros (vazia = válido). */
export function validateDigest(data, { fileName, digestsDir = DIGESTS_DIR } = {}) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  const checkKeys = (obj, path, allowed) => {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) err(path, `campo desconhecido "${k}"`);
    }
  };

  const checkText = (v, path, max, { required = true, multiline = false } = {}) => {
    if (v === undefined && !required) return;
    if (typeof v !== "string") return err(path, "deve ser string");
    const t = v.trim();
    if (!t) return err(path, "não pode ser vazio");
    if (t !== v) err(path, "sem espaços no início/fim");
    if (v.length > max) err(path, `máximo ${max} caracteres (tem ${v.length})`);
    if (HTML_RE.test(v)) err(path, "não pode conter HTML");
    if (CONTROL_RE.test(v)) err(path, "contém caractere de controle");
    if (!multiline && v.includes("\n")) err(path, "não pode ter quebra de linha");
    if (/\]\(/.test(v)) err(path, "links markdown não são permitidos no texto; use sources/toRead");
  };

  if (!isObj(data)) return ["raiz: deve ser um objeto JSON"];

  checkKeys(data, "raiz", ["schemaVersion", "date", "generatedAt", "tldr", "items", "toRead"]);

  if (data.schemaVersion !== 1) err("schemaVersion", "deve ser 1");

  if (!isValidDate(data.date)) err("date", "deve ser uma data válida AAAA-MM-DD");
  if (fileName && basename(fileName) !== `${data.date}.json`) {
    err("date", `não bate com o nome do arquivo (${basename(fileName)})`);
  }

  if (typeof data.generatedAt !== "string" || Number.isNaN(Date.parse(data.generatedAt)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(data.generatedAt)) {
    err("generatedAt", "deve ser data/hora ISO 8601 com fuso (ex.: 2026-11-14T11:04:12Z)");
  }

  // ---- items
  const ids = new Set();
  if (!Array.isArray(data.items)) {
    err("items", "deve ser uma lista");
  } else {
    if (data.items.length < LIMITS.itemsMin || data.items.length > LIMITS.itemsMax) {
      err("items", `deve ter entre ${LIMITS.itemsMin} e ${LIMITS.itemsMax} notícias (tem ${data.items.length})`);
    }
    data.items.forEach((it, i) => {
      const p = `items[${i}]`;
      if (!isObj(it)) return err(p, "deve ser objeto");
      checkKeys(it, p, ["id", "section", "title", "summary", "whyItMatters", "sources", "tags", "breaking", "followUp"]);

      const m = typeof it.id === "string" ? it.id.match(ID_RE) : null;
      if (!m) err(`${p}.id`, "formato AAAA-MM-DD-slug-em-kebab-case");
      else if (m[1] !== data.date) err(`${p}.id`, `deve começar com a data do digest (${data.date})`);
      else if (it.id.length > 80) err(`${p}.id`, "máximo 80 caracteres");
      if (typeof it.id === "string") {
        if (ids.has(it.id)) err(`${p}.id`, `duplicado: ${it.id}`);
        ids.add(it.id);
      }

      if (!SECTIONS.includes(it.section)) err(`${p}.section`, `deve ser um de: ${SECTIONS.join(", ")}`);
      checkText(it.title, `${p}.title`, LIMITS.title);
      checkText(it.summary, `${p}.summary`, LIMITS.summary, { multiline: true });
      checkText(it.whyItMatters, `${p}.whyItMatters`, LIMITS.whyItMatters);

      if (!Array.isArray(it.sources) || it.sources.length < 1 || it.sources.length > LIMITS.sourcesMax) {
        err(`${p}.sources`, `deve ter de 1 a ${LIMITS.sourcesMax} fontes`);
      } else {
        it.sources.forEach((s, j) => {
          const sp = `${p}.sources[${j}]`;
          if (!isObj(s)) return err(sp, "deve ser objeto");
          checkKeys(s, sp, ["name", "url"]);
          checkText(s.name, `${sp}.name`, LIMITS.sourceName);
          if (!isHttpsUrl(s.url)) err(`${sp}.url`, "deve ser uma URL https:// válida");
        });
      }

      if (!Array.isArray(it.tags) || it.tags.length > LIMITS.tagsMax) {
        err(`${p}.tags`, `deve ser lista com até ${LIMITS.tagsMax} tags`);
      } else {
        const seen = new Set();
        it.tags.forEach((t, j) => {
          if (typeof t !== "string" || !TAG_RE.test(t) || t.length > LIMITS.tag) {
            err(`${p}.tags[${j}]`, `use minúsculas, sem acento, kebab-case (sugestão: "${normalizeTag(t)}")`);
          }
          if (seen.has(t)) err(`${p}.tags[${j}]`, `tag repetida "${t}"`);
          seen.add(t);
        });
      }

      if (typeof it.breaking !== "boolean") err(`${p}.breaking`, "deve ser true ou false");

      if (it.followUp !== undefined) {
        const fp = `${p}.followUp`;
        if (!isObj(it.followUp)) {
          err(fp, "deve ser objeto");
        } else {
          checkKeys(it.followUp, fp, ["previousId", "whatChanged"]);
          checkText(it.followUp.whatChanged, `${fp}.whatChanged`, LIMITS.whatChanged);
          const prev = typeof it.followUp.previousId === "string" ? it.followUp.previousId.match(ID_RE) : null;
          if (!prev) {
            err(`${fp}.previousId`, "deve ser o id de uma notícia anterior");
          } else if (prev[1] >= data.date) {
            err(`${fp}.previousId`, "deve ser de um dia anterior ao digest");
          } else {
            const prevFile = join(digestsDir, `${prev[1]}.json`);
            let found = false;
            if (existsSync(prevFile)) {
              try {
                const prevData = JSON.parse(readFileSync(prevFile, "utf8"));
                found = Array.isArray(prevData.items) && prevData.items.some((x) => x && x.id === it.followUp.previousId);
              } catch { /* arquivo anterior inválido: tratado como não encontrado */ }
            }
            if (!found) err(`${fp}.previousId`, `não existe em digests/${prev[1]}.json`);
          }
        }
      }
    });
  }

  // ---- tldr
  if (!Array.isArray(data.tldr) || data.tldr.length < LIMITS.tldrMin || data.tldr.length > LIMITS.tldrMax) {
    err("tldr", `deve ter de ${LIMITS.tldrMin} a ${LIMITS.tldrMax} tópicos`);
  } else {
    data.tldr.forEach((t, i) => {
      const p = `tldr[${i}]`;
      if (!isObj(t)) return err(p, "deve ser objeto");
      checkKeys(t, p, ["text", "itemId"]);
      checkText(t.text, `${p}.text`, LIMITS.tldrText);
      if (t.itemId !== undefined && !ids.has(t.itemId)) err(`${p}.itemId`, `não corresponde a nenhum item do dia`);
    });
  }

  // ---- toRead
  if (!Array.isArray(data.toRead) || data.toRead.length > LIMITS.toReadMax) {
    err("toRead", `deve ser lista com até ${LIMITS.toReadMax} itens`);
  } else {
    data.toRead.forEach((r, i) => {
      const p = `toRead[${i}]`;
      if (!isObj(r)) return err(p, "deve ser objeto");
      checkKeys(r, p, ["title", "url", "note"]);
      checkText(r.title, `${p}.title`, LIMITS.title);
      if (!isHttpsUrl(r.url)) err(`${p}.url`, "deve ser uma URL https:// válida");
      checkText(r.note, `${p}.note`, LIMITS.toReadNote);
    });
  }

  return errors;
}

export function validateFile(file, opts = {}) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return [`JSON inválido: ${e.message}`];
  }
  // followUp é conferido contra os digests da mesma pasta do arquivo.
  return validateDigest(data, { fileName: file, digestsDir: dirname(resolve(file)), ...opts });
}

const listDigests = (dir) =>
  readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => join(dir, f));

// ---- CLI
// Este arquivo é idêntico nos repos de conteúdo e do site. Mantenha os dois em sincronia.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = (args.length ? args : [DIGESTS_DIR]).flatMap((a) =>
    existsSync(a) && statSync(a).isDirectory() ? listDigests(a) : [a],
  );

  if (!files.length) {
    console.error("Nenhum digest .json encontrado.");
    process.exit(1);
  }

  let failed = 0;
  for (const f of files) {
    const errors = validateFile(f);
    if (errors.length) {
      failed++;
      console.error(`✗ ${f}`);
      for (const e of errors) console.error(`   - ${e}`);
    } else {
      console.log(`✓ ${f}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
