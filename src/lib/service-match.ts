// Pure service-name matching (no database, no server-only), so it can be tested directly.
// The public quote form, the chat widget and the admin screens each carry their own copy of the
// service names, and they differ slightly from the names in the services table ("Stock Monitoring"
// vs "Stock Monitoring Services", "Tank & Depot Inspections" vs "Tank and Depot Inspections"), so
// matching is done on a normalised form. migrations/0006 uses the same rules in SQL.

/** Lower-case, "&" as "and", letters and digits only, no trailing "service(s)", no plural "s". */
export function normalizeServiceName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/\s+services?$/, "").replace(/ /g, "").replace(/s$/, "");
}

/**
 * Finds the service key a piece of text refers to, or null. Matches the key ("stock_monitoring")
 * or the label. Returns null when nothing matches, or when the text is ambiguous (matches more
 * than one service), so the caller asks a person instead of guessing.
 */
export function matchServiceKey(text: string | null | undefined, options: { key: string; label: string }[]): string | null {
  const wanted = normalizeServiceName(text ?? "");
  if (!wanted) return null;
  const hits = new Set<string>();
  for (const o of options) {
    if (normalizeServiceName(o.label) === wanted || normalizeServiceName(o.key.replace(/_/g, " ")) === wanted) hits.add(o.key);
  }
  return hits.size === 1 ? [...hits][0] : null;
}
