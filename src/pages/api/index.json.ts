import type { APIRoute } from "astro";
import { allDigests, withBase } from "../../lib/digests";

// Índice estático: datas disponíveis, contagem e TL;DR de cada dia.
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      schemaVersion: 1,
      digests: allDigests().map((d) => ({
        date: d.date,
        items: d.items.length,
        tldr: d.tldr.map((t) => t.text),
        url: withBase(`api/digests/${d.date}.json`),
      })),
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
