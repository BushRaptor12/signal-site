import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { clampImageFocus, DEFAULT_IMAGE_FOCUS } from "@/app/lib/image-focus";

const POST_IMAGE_SIZE = 1200;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

async function assertPublicImageHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("The story image URL must use a public host.");
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) throw new Error("The story image URL must use a public host.");
  if (ipVersion === 6 && isPrivateIpv6(host)) throw new Error("The story image URL must use a public host.");
  if (ipVersion) return;

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => (isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)))) {
    throw new Error("The story image URL must resolve to a public host.");
  }
}

async function fetchStoryImage(imageUrl: string) {
  let currentUrl: URL;
  try {
    currentUrl = new URL(imageUrl);
  } catch {
    throw new Error("This story does not have a valid image URL.");
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (currentUrl.protocol !== "https:") throw new Error("The story image must be served over HTTPS.");
    await assertPublicImageHost(currentUrl.hostname);

    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("The story image redirected too many times.");
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok) throw new Error("The story image could not be downloaded.");

    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) throw new Error("The story image URL did not return an image.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SOURCE_IMAGE_BYTES) throw new Error("The story image must be 12 MB or smaller.");

    const source = Buffer.from(await response.arrayBuffer());
    if (source.length === 0 || source.length > MAX_SOURCE_IMAGE_BYTES) throw new Error("The story image must be 12 MB or smaller.");
    return source;
  }

  throw new Error("The story image could not be downloaded.");
}

function wrapHeadline(value: string, fontSize: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) throw new Error("Enter a headline for the Facebook graphic.");

  const maxLineCharacters = Math.max(12, Math.floor((POST_IMAGE_SIZE * 0.87) / (fontSize * 0.56)));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxLineCharacters) {
      if (current) lines.push(current);
      current = "";
      for (let offset = 0; offset < word.length; offset += maxLineCharacters) {
        lines.push(word.slice(offset, offset + maxLineCharacters));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLineCharacters) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

function formatPostDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date for the graphic.");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid date for the graphic.");
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function buildOverlaySvg(headline: string, date: string, iconDataUrl: string, outputSize: number) {
  const normalizedHeadline = headline.trim().replace(/\s+/g, " ");
  if (!normalizedHeadline || normalizedHeadline.length > 100) throw new Error("The graphic headline must be between 1 and 100 characters.");
  const fontSize = normalizedHeadline.length > 72 ? 50 : normalizedHeadline.length > 46 ? 62 : 74;
  const lines = wrapHeadline(normalizedHeadline, fontSize);
  if (lines.length > 3) throw new Error("Shorten the graphic headline so it fits on the image.");
  const lineHeight = Math.round(fontSize * 1.14);
  const firstBaseline = Math.round(1015 - ((lines.length - 1) * lineHeight) / 2);
  const headlineSvg = lines
    .map((line, index) => `<text x="66" y="${firstBaseline + index * lineHeight}" text-anchor="start" fill="#fff" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="-.5">${escapeXml(line)}</text>`)
    .join("");
  const dateText = escapeXml(formatPostDate(date));

  return Buffer.from(`<svg width="${outputSize}" height="${outputSize}" viewBox="0 0 ${POST_IMAGE_SIZE} ${POST_IMAGE_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="top-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#061321" stop-opacity=".52"/><stop offset="1" stop-color="#061321" stop-opacity="0"/></linearGradient>
      <linearGradient id="bottom-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#061321" stop-opacity="0"/><stop offset=".24" stop-color="#061321" stop-opacity=".74"/><stop offset="1" stop-color="#061321" stop-opacity=".98"/></linearGradient>
    </defs>
    <rect x="0" y="0" width="1200" height="180" fill="url(#top-shade)" />
    <text x="66" y="74" fill="#f0d18a" font-family="Inter, Arial, Helvetica, sans-serif" font-size="30" font-weight="600" letter-spacing="1">${dateText}</text>
    <rect x="66" y="96" width="72" height="3" rx="1.5" fill="#d4ae64" />
    <image href="${iconDataUrl}" x="1040" y="34" width="116" height="116" opacity=".82" preserveAspectRatio="xMidYMid meet" />
    <rect x="0" y="735" width="1200" height="465" fill="url(#bottom-shade)" />
    ${headlineSvg}
    <path d="M66 1115H1134" stroke="#d4ae64" stroke-opacity=".6" stroke-width="1" />
    <text x="66" y="1164" fill="#f4f0e5" font-family="Inter, Arial, Helvetica, sans-serif" font-size="27" font-weight="500" letter-spacing=".4">readthebeacon.news</text>
  </svg>`);
}

export async function renderFacebookPostImage(input: {
  date: string;
  focusX?: number | null;
  focusY?: number | null;
  headline: string;
  outputSize?: number;
  imageBuffer?: Buffer | null;
  imageUrl?: string | null;
}) {
  // Sharp's SVG text renderer uses Fontconfig. Point it at the bundled Inter
  // font before Sharp is loaded so this also works in serverless deployments.
  process.env.FONTCONFIG_PATH ??= path.join(process.cwd(), "fontconfig");
  const sharp = (await import("sharp")).default;
  const source = input.imageBuffer ?? (input.imageUrl ? await fetchStoryImage(input.imageUrl) : null);
  if (!source) throw new Error("Choose or upload an image for this Facebook post.");
  const normalized = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  const cropSize = Math.min(normalized.info.width, normalized.info.height);
  const focusX = clampImageFocus(input.focusX ?? DEFAULT_IMAGE_FOCUS) / 100;
  const focusY = clampImageFocus(input.focusY ?? DEFAULT_IMAGE_FOCUS) / 100;
  const outputSize = input.outputSize === 2400 ? 2400 : POST_IMAGE_SIZE;
  const cropLeft = Math.round((normalized.info.width - cropSize) * focusX);
  const cropTop = Math.round((normalized.info.height - cropSize) * focusY);
  const iconPath = path.join(process.cwd(), "public", "beacon-icon-192.png");
  const iconDataUrl = `data:image/png;base64,${(await readFile(iconPath)).toString("base64")}`;
  const overlay = buildOverlaySvg(input.headline, input.date, iconDataUrl, outputSize);

  return sharp(normalized.data)
    .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
    .resize(outputSize, outputSize, { fit: "cover", position: sharp.strategy.attention })
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
}
