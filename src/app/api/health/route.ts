import { NextResponse } from "next/server";
import { getLiveReadiness } from "@/lib/config/readiness";
import { getServerGoogleMapsKey, getOpenAiKey, getSupabaseConfig } from "@/lib/config/env";
import { apiErrorResponse } from "@/lib/utils/errors";

export const runtime = "nodejs";

/**
 * Live connectivity probes. Never returns secret values.
 * Only runs external checks when explicitly requested (?probe=1) and keys exist.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const probe = searchParams.get("probe") === "1";
    const readiness = getLiveReadiness();

    const probes: Record<
      string,
      { ok: boolean; detail: string; skipped?: boolean }
    > = {};

    if (!probe) {
      return NextResponse.json({
        ok: true,
        probed: false,
        isLiveCapable: readiness.isLiveCapable,
        readiness,
        hint: "Aggiungi ?probe=1 per verificare connettività verso Google/OpenAI/Supabase (solo se configurati).",
      });
    }

    // Google Places probe (minimal autocomplete)
    const googleKey = getServerGoogleMapsKey();
    if (!googleKey) {
      probes.google = {
        ok: false,
        skipped: true,
        detail: "GOOGLE_MAPS_API_KEY assente.",
      };
    } else {
      try {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleKey,
            },
            body: JSON.stringify({
              input: "Roma",
              languageCode: "it",
            }),
          },
        );
        probes.google = {
          ok: res.ok,
          detail: res.ok
            ? "Places Autocomplete risponde."
            : `Places HTTP ${res.status}. Verifica API abilitate e billing.`,
        };
      } catch {
        probes.google = {
          ok: false,
          detail: "Errore di rete verso Places API.",
        };
      }
    }

    // OpenAI probe (models list is lightweight)
    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      probes.openai = {
        ok: false,
        skipped: true,
        detail: "OPENAI_API_KEY assente.",
      };
    } else {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${openAiKey}` },
        });
        probes.openai = {
          ok: res.ok,
          detail: res.ok
            ? "OpenAI API raggiungibile."
            : `OpenAI HTTP ${res.status}. Verifica chiave e quota.`,
        };
      } catch {
        probes.openai = {
          ok: false,
          detail: "Errore di rete verso OpenAI.",
        };
      }
    }

    // Supabase probe
    const supabase = getSupabaseConfig();
    if (!supabase) {
      probes.supabase = {
        ok: false,
        skipped: true,
        detail: "Supabase non configurato.",
      };
    } else {
      try {
        const res = await fetch(`${supabase.url}/rest/v1/`, {
          headers: {
            apikey: supabase.anonKey,
            Authorization: `Bearer ${supabase.anonKey}`,
          },
        });
        probes.supabase = {
          ok: res.ok || res.status === 200 || res.status === 404,
          detail: res.ok || res.status === 404
            ? "Progetto Supabase raggiungibile."
            : `Supabase HTTP ${res.status}.`,
        };
      } catch {
        probes.supabase = {
          ok: false,
          detail: "Errore di rete verso Supabase.",
        };
      }
    }

    const criticalOk = probes.google?.ok === true;
    return NextResponse.json({
      ok: criticalOk,
      probed: true,
      isLiveCapable: readiness.isLiveCapable,
      probes,
      readiness,
    });
  } catch (error) {
    const body = apiErrorResponse(error);
    return NextResponse.json(body, { status: body.status });
  }
}
