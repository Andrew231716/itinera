import { NextResponse } from "next/server";
import { getLiveReadiness } from "@/lib/config/readiness";
import {
  getServerGoogleMapsKey,
  getOpenAiKey,
  getGeminiKey,
  getSupabaseConfig,
} from "@/lib/config/env";
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
        hint: "Aggiungi ?probe=1 per verificare connettività verso Google/Gemini/OpenAI/Supabase (solo se configurati).",
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

    // Gemini probe (free tier Generative Language API)
    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      probes.gemini = {
        ok: false,
        skipped: true,
        detail: "Nessuna chiave Google disponibile per Gemini.",
      };
    } else {
      try {
        const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(geminiKey)}`,
        );
        if (res.ok) {
          probes.gemini = {
            ok: true,
            detail: `Gemini (${model}) raggiungibile.`,
          };
        } else {
          let errMsg = "";
          try {
            const body = (await res.json()) as {
              error?: { message?: string; details?: Array<{ reason?: string }> };
            };
            errMsg = body.error?.message ?? "";
            const reason = body.error?.details?.find((d) => d.reason)?.reason;
            if (reason === "API_KEY_SERVICE_BLOCKED" || /blocked/i.test(errMsg)) {
              errMsg =
                "API abilitata sul progetto, ma la chiave server la blocca: in Google Cloud → Credentials → chiave Itinera server → API restrictions → aggiungi «Generative Language API» → Save.";
            } else if (/not been used|disabled|not enabled/i.test(errMsg)) {
              errMsg =
                "Abilita Generative Language API sul progetto itinera-509522 (Enable), poi riprova.";
            }
          } catch {
            /* ignore */
          }
          probes.gemini = {
            ok: false,
            detail: errMsg || `Gemini HTTP ${res.status}.`,
          };
        }
      } catch {
        probes.gemini = {
          ok: false,
          detail: "Errore di rete verso Gemini.",
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
        // Root /rest/v1/ rejects anon keys; probe a real table instead.
        const res = await fetch(
          `${supabase.url}/rest/v1/trips?select=id&limit=1`,
          {
            headers: {
              apikey: supabase.anonKey,
              Authorization: `Bearer ${supabase.anonKey}`,
            },
          },
        );
        probes.supabase = {
          ok: res.ok,
          detail: res.ok
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
