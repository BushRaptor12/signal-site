export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requestHasAdminAccess } from "@/app/lib/admin.server";
import { checkRateLimit, rateLimitIdentifier, rateLimitResponse } from "@/app/lib/rate-limit";
import { guessSourceLabel } from "@/app/lib/source-lean";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).toString();
  } catch {
    return "";
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value: string | null | undefined) {
  return value ? decodeHtml(value).replace(/\s+/g, " ").trim() : "";
}

function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const captured = match ? match[match.length - 1] : undefined;
    const value = cleanText(captured);
    if (value) return value;
  }
  return "";
}

function extractMetadata(html: string) {
  const title = firstMatch(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=(["'])(.*?)\1[^>]*>/i,
    /<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:title["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=(["'])(.*?)\1[^>]*>/i,
    /<meta[^>]+content=(["'])(.*?)\1[^>]+name=["']twitter:title["'][^>]*>/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);

  const siteName = firstMatch(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=(["'])(.*?)\1[^>]*>/i,
    /<meta[^>]+content=(["'])(.*?)\1[^>]+property=["']og:site_name["'][^>]*>/i,
    /<meta[^>]+name=["']application-name["'][^>]+content=(["'])(.*?)\1[^>]*>/i,
    /<meta[^>]+content=(["'])(.*?)\1[^>]+name=["']application-name["'][^>]*>/i,
  ]);

  return { title, siteName };
}

function stripSiteSuffix(title: string, siteName: string) {
  const trimmedTitle = cleanText(title);
  const trimmedSiteName = cleanText(siteName);
  if (!trimmedTitle || !trimmedSiteName) return trimmedTitle;

  const separators = [" | ", " - ", " — ", " :: ", " • "];
  for (const separator of separators) {
    if (trimmedTitle.endsWith(`${separator}${trimmedSiteName}`)) {
      return trimmedTitle.slice(0, -(`${separator}${trimmedSiteName}`).length).trim();
    }
    if (trimmedTitle.startsWith(`${trimmedSiteName}${separator}`)) {
      return trimmedTitle.slice(`${trimmedSiteName}${separator}`.length).trim();
    }
  }

  return trimmedTitle;
}

function guessTitleFromPath(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments.at(-1) ?? "";
  if (!slug) return "";

  return slug
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit({
      key: `admin:source-preview:${rateLimitIdentifier(req)}`,
      limit: 40,
      windowMs: 10 * 60 * 1000,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    if (!(await requestHasAdminAccess(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { url?: unknown };
    const normalizedUrl = normalizeUrl(String(body.url ?? ""));
    if (!normalizedUrl) {
      return NextResponse.json({ error: "A valid source URL is required." }, { status: 400 });
    }

    const url = new URL(normalizedUrl);
    const fallbackSiteName = guessSourceLabel(normalizedUrl) ?? "";
    let siteName = fallbackSiteName;
    let title = guessTitleFromPath(url);

    try {
      const res = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BeaconSourcePreview/1.0; +https://readthebeacon.news)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const html = await res.text();
        const metadata = extractMetadata(html);
        siteName = cleanText(metadata.siteName) || fallbackSiteName;
        title = stripSiteSuffix(metadata.title, siteName) || cleanText(metadata.title) || title;
      }
    } catch {
      // Fall back to URL-derived guesses when the source blocks fetching.
    }

    return NextResponse.json({
      ok: true,
      source: {
        url: normalizedUrl,
        name: siteName || fallbackSiteName || guessSourceLabel(normalizedUrl) || "",
        title: title || "",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: messageFromError(error) }, { status: 500 });
  }
}
