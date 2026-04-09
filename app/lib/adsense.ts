function normalizeAdsenseClient(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ca-pub-")) {
    return {
      metaContent: trimmed,
      adsTxtPublisher: trimmed.replace(/^ca-/, ""),
    };
  }

  if (trimmed.startsWith("pub-")) {
    return {
      metaContent: `ca-${trimmed}`,
      adsTxtPublisher: trimmed,
    };
  }

  return null;
}

export function getAdsenseConfig() {
  return normalizeAdsenseClient(
    process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT ?? process.env.GOOGLE_ADSENSE_CLIENT
  );
}
