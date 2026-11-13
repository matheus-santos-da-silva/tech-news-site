// Leitura dos digests no build. Os dados já foram validados por scripts/validate-content.mjs
// antes do `astro build`; aqui só lemos e montamos as estruturas das páginas.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error módulo .mjs sem tipos
import { digestsDir, IMAGES_CACHE } from "../../scripts/content-dir.mjs";

export type SectionId = "ia" | "linguagens" | "mercado" | "seguranca" | "brasil";

export interface Source { name: string; url: string }
export interface Item {
  id: string;
  section: SectionId;
  title: string;
  summary: string;
  whyItMatters: string;
  sources: Source[];
  tags: string[];
  breaking: boolean;
  followUp?: { previousId: string; whatChanged: string };
  /** Preenchido no build a partir do cache de imagens. */
  image?: string;
}
export interface Digest {
  schemaVersion: 1;
  date: string;
  generatedAt: string;
  tldr: { text: string; itemId?: string }[];
  items: Item[];
  toRead: { title: string; url: string; note: string }[];
}

export const SECTIONS: { id: SectionId; name: string }[] = [
  { id: "ia", name: "IA e LLMs" },
  { id: "linguagens", name: "Linguagens e frameworks" },
  { id: "mercado", name: "Mercado e big techs" },
  { id: "seguranca", name: "Segurança e cloud" },
  { id: "brasil", name: "Brasil" },
];
export const sectionName = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.name;

let cached: Digest[] | null = null;

/** Todos os digests, do mais recente para o mais antigo. */
export function allDigests(): Digest[] {
  if (cached) return cached;
  const dir: string = digestsDir();
  const images: Record<string, { image: string | null }> = existsSync(IMAGES_CACHE)
    ? JSON.parse(readFileSync(IMAGES_CACHE, "utf8"))
    : {};
  cached = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as Digest;
      for (const it of d.items) {
        const img = it.sources.map((s) => images[s.url]?.image).find(Boolean);
        if (img) it.image = img;
      }
      return d;
    });
  return cached;
}

export function neighbours(date: string) {
  const all = allDigests();
  const i = all.findIndex((d) => d.date === date);
  return { newer: all[i - 1]?.date, older: all[i + 1]?.date };
}

// ---- datas (sempre em UTC para não deslocar o dia)
const parse = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts }).format(parse(date));

export const weekday = (date: string) => fmt(date, { weekday: "long" });
export const dayMonth = (date: string) => fmt(date, { day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ");
export const fullDate = (date: string) => fmt(date, { day: "numeric", month: "long", year: "numeric" });
export const shortDate = (date: string) => fmt(date, { day: "2-digit", month: "2-digit" });
export const year = (date: string) => date.slice(0, 4);

/** Últimos `n` dias corridos até `end`, com o digest de cada um (ou undefined). */
export function dayStrip(end: string, n: number) {
  const byDate = new Map(allDigests().map((d) => [d.date, d]));
  const days: { date: string; count: number | null }[] = [];
  const t = parse(end);
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(t.getTime() - i * 864e5).toISOString().slice(0, 10);
    const d = byDate.get(date);
    days.push({ date, count: d ? d.items.length : null });
  }
  return days;
}

/** Meses (mais recente primeiro) com a grade de dias para o calendário. */
export function calendarMonths() {
  const dates = new Set(allDigests().map((d) => d.date));
  const months = [...new Set([...dates].map((d) => d.slice(0, 7)))].sort().reverse();
  return months.map((ym) => {
    const [y, m] = ym.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7; // semana começa na segunda
    const cells: ({ day: number; date: string; has: boolean } | null)[] = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${ym}-${String(day).padStart(2, "0")}`;
      cells.push({ day, date, has: dates.has(date) });
    }
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(first);
    return { ym, label, cells };
  });
}

export const withBase = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
export const dayUrl = (date: string) => withBase(`${date}/`);
export const itemUrl = (id: string) => withBase(`${id.slice(0, 10)}/#${id}`);
export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
