import { KNOWN_FUEL_BRANDS } from "@/lib/fuel/types";

/** Normalize brand/name text to a stable filter key. */
export function normalizeBrandKey(
  ...parts: Array<string | undefined | null>
): string | undefined {
  const raw = parts.filter(Boolean).join(" ").toLowerCase();
  if (!raw.trim()) return undefined;

  if (/agip|\beni\b|eni spa|eni station/.test(raw)) return "eni";
  if (/\bq8\b|kuwait/.test(raw)) return "q8";
  if (/\besso\b|exxon/.test(raw)) return "esso";
  if (/\bapi[\s-]?ip\b|\bip\b(?!\w)|italiana petroli/.test(raw)) return "ip";
  if (/\bshell\b/.test(raw)) return "shell";
  if (/tamoil/.test(raw)) return "tamoil";
  if (/total\s*energies|totalerg|\btotal\b/.test(raw)) return "total";
  if (/beyfin/.test(raw)) return "beyfin";
  if (/pompe\s*bianche|retitalia/.test(raw)) return "pompebianche";
  if (/vega/.test(raw)) return "vega";
  if (/eko\s*point|ekopoint/.test(raw)) return "ekopoint";
  if (/keropetrol/.test(raw)) return "keropetrol";
  if (/sarni/.test(raw)) return "sarni";
  if (/repsoil|repsol/.test(raw)) return "repsol";

  // Fallback: first alphanumeric token
  const token = raw.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0];
  return token || undefined;
}

export function brandLabel(key: string): string {
  const known = KNOWN_FUEL_BRANDS.find((b) => b.key === key);
  if (known) return known.label;
  if (!key) return "Altro";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function stationMatchesBrand(
  station: { brandKey?: string; brand?: string; name?: string },
  brandFilter: string,
): boolean {
  const want = brandFilter.trim().toLowerCase();
  if (!want) return true;
  const key =
    station.brandKey ??
    normalizeBrandKey(station.brand, station.name) ??
    "";
  return key === want;
}
