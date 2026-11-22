/**
 * Parses a MindVault resource link from a deep link or HTTP(S) URL.
 * Returns the URI-decoded resource id, or null for unsupported URLs.
 */
export function parseResourceId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  let segments: string[];
  if (parsed.protocol === "mindvault:") {
    if (parsed.hostname !== "resources") return null;
    segments = parsed.pathname.split("/").filter(Boolean);
  } else if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] !== "resources") return null;
    segments = segments.slice(1);
  } else {
    return null;
  }

  if (segments.length !== 1) return null;

  try {
    return decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
}
