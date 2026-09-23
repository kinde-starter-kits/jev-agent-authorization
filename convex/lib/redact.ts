const EMAIL = /[^\s@"'<>]+@([^\s@"'<>]+\.[^\s@"'<>]+)/g;
const MAX_VALUE = 80;

export function redactText(text: string) {
  const masked = text.replace(EMAIL, (_match, domain: string) => `…@${domain}`);
  return masked.length > MAX_VALUE ? `${masked.slice(0, MAX_VALUE)}…` : masked;
}

/** Public view of tool arguments: no reason text, no email local parts, short values. */
export function publicArgs(argsJson: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'reason' || value === undefined || value === null) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    out[key] = redactText(text);
  }
  return out;
}
