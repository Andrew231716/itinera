import { redirect } from "next/navigation";

/**
 * Clean deep-link entry for Siri / Shortcuts:
 *   /go?q=Via+Gardenie+Rozzano  →  /?go=Via+Gardenie+Rozzano
 */
export default async function GoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.q ?? sp.go ?? sp.voice ?? sp.destinazione;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value?.trim()) {
    redirect(`/?go=${encodeURIComponent(value.trim())}`);
  }
  redirect("/");
}
