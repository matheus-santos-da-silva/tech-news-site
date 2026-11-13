#!/usr/bin/env node
// Busca a imagem de capa (og:image / twitter:image) das fontes de cada notícia.
// Roda no workflow do site, fora do alcance do agente. O resultado fica em .cache/images.json,
// que o workflow persiste entre builds (actions/cache) para não buscar o histórico todo dia.
//
// Proteções: só https, nada de IP literal nem hosts que resolvam para rede privada (SSRF),
// redirects conferidos um a um, timeout e limite de bytes lidos.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { digestsDir, IMAGES_CACHE } from "./content-dir.mjs";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 768 * 1024; // as meta tags ficam no <head>
const MAX_REDIRECTS = 3;
const CONCURRENCY = 6;
const RETRY_MISSING_AFTER_DAYS = 3;
const UA = "Mozilla/5.0 (compatible; tech-news-site/1.0; +https://github.com)";

function isPrivateIp(ip) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function assertSafeUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("não é https");
  if (u.username || u.password) throw new Error("credenciais na URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) throw new Error("IP literal");
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host interno");
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("resolve para rede privada");
  return u;
}

async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchHtml(url) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = await assertSafeUrl(current);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), u).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!(res.headers.get("content-type") || "").includes("html")) throw new Error("não é HTML");
    return { html: await readLimited(res), finalUrl: u.href };
  }
  throw new Error("redirects demais");
}

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function extractImage(html, baseUrl) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const found = {};
  for (const tag of metas) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1]?.toLowerCase();
    const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && content && !found[key]) found[key] = decode(content.trim());
  }
  const candidate = found["og:image:secure_url"] || found["og:image"] || found["og:image:url"] || found["twitter:image"] || found["twitter:image:src"];
  if (!candidate) return null;
  try {
    const img = new URL(candidate, baseUrl);
    if (img.protocol !== "https:" || isIP(img.hostname.replace(/^\[|\]$/g, ""))) return null;
    if (img.href.length > 2048) return null;
    return img.href;
  } catch {
    return null;
  }
}

async function imageFor(url) {
  try {
    const { html, finalUrl } = await fetchHtml(url);
    return { image: extractImage(html, finalUrl) };
  } catch (e) {
    return { image: null, error: e.message };
  }
}

// ---- main
const dir = digestsDir();
const cache = existsSync(IMAGES_CACHE) ? JSON.parse(readFileSync(IMAGES_CACHE, "utf8")) : {};
const now = Date.now();
const stale = (entry) =>
  !entry || (entry.image === null && now - Date.parse(entry.fetchedAt) > RETRY_MISSING_AFTER_DAYS * 864e5);

const urls = new Set();
for (const f of readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
  for (const it of d.items) for (const s of it.sources) urls.add(s.url);
}
const todo = [...urls].filter((u) => stale(cache[u]));
console.log(`${urls.size} fontes, ${todo.length} para buscar`);

let found = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const r = await imageFor(url);
      cache[url] = { image: r.image, fetchedAt: new Date().toISOString() };
      if (r.image) found++;
      else console.log(`  - sem imagem: ${url}${r.error ? ` (${r.error})` : ""}`);
    }
  }),
);

mkdirSync(dirname(IMAGES_CACHE), { recursive: true });
writeFileSync(IMAGES_CACHE, JSON.stringify(cache, null, 2) + "\n");
console.log(`${found}/${todo.length} imagens novas encontradas`);
