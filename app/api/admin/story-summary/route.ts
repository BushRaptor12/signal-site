export const runtime = "nodejs";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";
import { supabaseServer } from "@/app/lib/supabase.server";

const MAX_URLS = 6;
const MAX_HTML_BYTES = 1_000_000;
const STOP_WORDS = new Set("a an and are as at be been by for from had has have he her his in into is it its of on or our she that the their them they this to was were will with would you your after about also but can did do during it more not over said says than there these those through under up when where while who why".split(" "));

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase();
  return !(
    normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.")
  );
}

async function validatePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("One of the source links is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS source links are supported.");
  if (url.username || url.password) throw new Error("Source links cannot contain login credentials.");

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("A source link must point to a public website.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("A source link must point to a public website.");
  }
  return url;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\\u[0-9a-f]{4}/gi, " "))
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

async function readLimitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remaining = MAX_HTML_BYTES - bytes;
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    bytes += chunk.byteLength;
    if (chunk.byteLength !== value.byteLength) {
      await reader.cancel();
      break;
    }
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function fetchSourceText(rawUrl: string) {
  let url = await validatePublicUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BeaconSummaryDraft/1.0; +https://readthebeacon.news)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) return { description: "", paragraphs: [] as string[] };
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) return { description: "", paragraphs: [] as string[] };
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) return { description: "", paragraphs: [] as string[] };
    const html = await readLimitedText(response);
    const description = metaContent(html, "og:description") || metaContent(html, "description") || metaContent(html, "twitter:description");
    const cleanedHtml = html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ");
    const article = cleanedHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? cleanedHtml;
    const paragraphs = Array.from(article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
      .map((match) => cleanText(match[1]))
      .filter((paragraph) => paragraph.length >= 55 && paragraph.length <= 1600);
    return { description, paragraphs };
  }
  return { description: "", paragraphs: [] as string[] };
}

function words(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function significantWords(value: string) {
  return words(value).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function median(values: number[], fallback: number) {
  if (!values.length) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function splitSentences(paragraph: string) {
  return paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function buildSummaryDraft(input: {
  examples: string[][];
  sourceTexts: Array<{ name: string; title: string; description: string; paragraphs: string[] }>;
  storyTitle: string;
}) {
  const examplePoints = input.examples.flat().filter(Boolean);
  const targetCount = Math.max(3, Math.min(5, median(input.examples.map((example) => example.length), 3)));
  const targetWords = Math.max(12, Math.min(32, median(examplePoints.map((point) => words(point).length), 21)));
  const useFinalPunctuation = examplePoints.length === 0 || examplePoints.filter((point) => /[.!?]["')\]]*$/.test(point)).length / examplePoints.length >= 0.45;
  const focusTerms = new Set(significantWords(input.storyTitle));
  const candidates: Array<{ source: string; text: string; tokens: Set<string>; score: number }> = [];

  for (const source of input.sourceTexts) {
    const texts = [...source.paragraphs.slice(0, 12), source.description].filter(Boolean);
    for (const [paragraphIndex, paragraph] of texts.entries()) {
      for (const [sentenceIndex, rawSentence] of splitSentences(paragraph).entries()) {
        let text = cleanText(rawSentence).replace(/^[-•*\s]+/, "");
        const count = words(text).length;
        if (count < 8 || count > 48 || text.length < 45 || text.length > 360) continue;
        if (/subscribe|sign in|log in|cookie|privacy policy|read more|click here|all rights reserved|advertisement/i.test(text)) continue;
        text = useFinalPunctuation ? text.replace(/[.!?]+["')\]]*$/, "") + "." : text.replace(/[.!?]+["')\]]*$/, "");
        const tokens = new Set(significantWords(text));
        const titleOverlap = [...focusTerms].filter((term) => tokens.has(term)).length;
        const lengthFit = Math.max(0, 1 - Math.abs(count - targetWords) / Math.max(targetWords, 1));
        const leadBonus = paragraphIndex === 0 && sentenceIndex === 0 ? 1.3 : sentenceIndex === 0 ? 0.5 : 0;
        const numberBonus = /\d/.test(text) ? 0.35 : 0;
        const sourceTitleOverlap = [...new Set(significantWords(`${source.name} ${source.title}`))].filter((term) => tokens.has(term)).length;
        candidates.push({ source: source.name, text, tokens, score: titleOverlap * 2 + sourceTitleOverlap * 0.35 + lengthFit * 2 + leadBonus + numberBonus });
      }
    }
  }

  const selected: typeof candidates = [];
  const sourceCounts = new Map<string, number>();
  while (selected.length < targetCount && candidates.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const duplicate = selected.some((item) => {
        const overlap = [...candidate.tokens].filter((token) => item.tokens.has(token)).length;
        return overlap / Math.max(1, Math.min(candidate.tokens.size, item.tokens.size)) > 0.72;
      });
      if (duplicate) continue;
      const sourcePenalty = (sourceCounts.get(candidate.source) ?? 0) * 0.8;
      const score = candidate.score - sourcePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const [candidate] = candidates.splice(bestIndex, 1);
    selected.push(candidate);
    sourceCounts.set(candidate.source, (sourceCounts.get(candidate.source) ?? 0) + 1);
  }

  return { points: selected.map((candidate) => candidate.text), targetCount, targetWords, usedStyleExamples: examplePoints.length };
}

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit({ key: `admin:story-summary:${rateLimitIdentifier(request)}`, limit: 8, windowMs: 10 * 60 * 1000 });
    if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);
    if (!(await requestHasAdminAccess(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { storyId?: unknown; title?: unknown; urls?: unknown; sources?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const sourceRows = Array.isArray(body.sources)
      ? body.sources.slice(0, MAX_URLS).flatMap((source) => {
          if (!source || typeof source !== "object") return [];
          const row = source as { url?: unknown; name?: unknown; title?: unknown };
          const url = typeof row.url === "string" ? row.url.trim() : "";
          return url ? [{ url, name: typeof row.name === "string" ? row.name.trim() : "", title: typeof row.title === "string" ? row.title.trim() : "" }] : [];
        })
      : Array.isArray(body.urls)
        ? body.urls.map((url) => ({ url: String(url).trim(), name: "", title: "" })).filter((source) => source.url).slice(0, MAX_URLS)
        : [];
    if (!sourceRows.length) return NextResponse.json({ error: "Add at least one source URL first." }, { status: 400 });

    const supabase = supabaseServer();
    let exampleQuery = supabase.from("stories").select("summary").in("status", ["published", "archived"]).order("content_updated_at", { ascending: false, nullsFirst: false }).limit(40);
    const storyId = typeof body.storyId === "string" ? body.storyId.trim() : "";
    if (storyId) exampleQuery = exampleQuery.neq("id", storyId);
    const [{ data: exampleRows, error: exampleError }, sourceResults] = await Promise.all([
      exampleQuery,
      Promise.allSettled(sourceRows.map(async (source) => {
        const sourceUrl = await validatePublicUrl(source.url);
        const fetched = await fetchSourceText(sourceUrl.toString());
        return { name: source.name || sourceUrl.hostname.replace(/^www\./, ""), title: source.title, ...fetched };
      })),
    ]);
    if (exampleError) throw new Error(exampleError.message);

    const sourceTexts = sourceResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!sourceTexts.some((source) => source.paragraphs.length || source.description)) {
      return NextResponse.json({ error: "I couldn't read article text from those links. Check that the URLs point to accessible articles, then try again." }, { status: 422 });
    }

    const examples = (exampleRows ?? [])
      .map((row) => Array.isArray(row.summary) ? row.summary.map(String).filter(Boolean) : [])
      .filter((summary) => summary.length > 0);
    const draft = buildSummaryDraft({ examples, sourceTexts, storyTitle: title });
    if (!draft.points.length) return NextResponse.json({ error: "I could read the sources but couldn't find enough complete sentences to draft summary points." }, { status: 422 });
    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "We couldn't draft a summary from these sources." }, { status: 500 });
  }
}
