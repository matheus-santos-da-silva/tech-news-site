import type { APIRoute } from "astro";
import { allDigests, type Digest } from "../../../lib/digests";

export function getStaticPaths() {
  return allDigests().map((digest) => ({ params: { date: digest.date }, props: { digest } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify((props as { digest: Digest }).digest), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
