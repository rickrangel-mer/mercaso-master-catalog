// Loads a site data file. The single-file build (`pnpm web:html`) embeds the files in the page as
// window.__MERCASO_DATA__, keyed by path, because browsers block fetch() on a file opened from disk.
// Resolves to null when the file is absent (e.g. prices in a build without them).
declare global {
  interface Window {
    __MERCASO_DATA__?: Record<string, unknown>;
  }
}

export async function loadJson<T>(path: string): Promise<T | null> {
  const embedded = typeof window === "undefined" ? undefined : window.__MERCASO_DATA__;
  if (embedded) return (embedded[path] as T | undefined) ?? null;
  const r = await fetch(path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}
