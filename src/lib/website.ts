/** A venue website we are willing to link to: http(s) only, anything else (or unparseable) is null. */
export function safeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The hostname to show for a website ("www." dropped); null when the URL is not linkable. */
export function websiteHostname(raw: string | null | undefined): string | null {
  const href = safeWebsiteUrl(raw);
  return href === null ? null : new URL(href).hostname.replace(/^www\./, '');
}
