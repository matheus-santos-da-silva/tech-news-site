import type { APIRoute } from "astro";
import { allDigests, itemUrl, withBase, sectionName } from "../lib/digests";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const plain = (s: string) => s.replace(/\*\*|`/g, "");

// Uma entrada por notícia, dos últimos 7 digests.
export const GET: APIRoute = ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;
  const digests = allDigests().slice(0, 7);
  const entries = digests.flatMap((d) =>
    d.items.map((it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(abs(itemUrl(it.id)))}</link>
      <guid isPermaLink="false">${esc(it.id)}</guid>
      <pubDate>${new Date(d.generatedAt).toUTCString()}</pubDate>
      <category>${esc(sectionName(it.section))}</category>
      <description>${esc(plain(it.summary) + "\n\nPor que importa: " + plain(it.whyItMatters))}</description>
    </item>`),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tech News</title>
    <link>${esc(abs(withBase("")))}</link>
    <description>Resumo diário de notícias de tecnologia para devs, em português.</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date(digests[0].generatedAt).toUTCString()}</lastBuildDate>
${entries.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
