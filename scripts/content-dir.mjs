// Onde estão os digests:
// 1. CONTENT_DIR, se definido (o workflow clona o repo de conteúdo em ./content);
// 2. ./content, se existir;
// 3. ../tech-news (repo de conteúdo ao lado, para desenvolvimento local).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// process.cwd(): no build o Astro empacota este módulo e import.meta.url deixa de apontar para scripts/.
// Rode sempre a partir da raiz do repo (os scripts do npm já fazem isso).
export const SITE_ROOT = process.cwd();

export function contentDir() {
  const candidates = [process.env.CONTENT_DIR, join(SITE_ROOT, "content"), join(SITE_ROOT, "..", "tech-news")].filter(Boolean);
  for (const c of candidates) {
    const dir = resolve(c);
    if (existsSync(join(dir, "digests"))) return dir;
  }
  throw new Error(`Pasta de conteúdo não encontrada. Tentei: ${candidates.join(", ")}`);
}

export const digestsDir = () => join(contentDir(), "digests");
export const IMAGES_CACHE = join(SITE_ROOT, ".cache", "images.json");
