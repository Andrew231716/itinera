"use client";

import { useCallback, useState } from "react";
import type { PlaceRef } from "@/lib/types/trip";

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Permesso posizione negato. Abilitalo nelle impostazioni del browser o del telefono.";
    case err.POSITION_UNAVAILABLE:
      return "Posizione non disponibile. Verifica che il GPS sia attivo.";
    case err.TIMEOUT:
      return "Timeout nel rilevare la posizione. Riprova.";
    default:
      return "Impossibile ottenere la posizione attuale.";
  }
}

/**
 * Browser GPS → optional reverse geocode via /api/places/reverse.
 */
export function useCurrentLocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(async (): Promise<PlaceRef | null> => {
    setError(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setError("Geolocalizzazione non supportata su questo dispositivo.");
      return null;
    }

    if (
      typeof window.isSecureContext === "boolean" &&
      !window.isSecureContext
    ) {
      setError("Il GPS richiede HTTPS (o localhost).");
      return null;
    }

    setLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 18000,
            maximumAge: 30_000,
          });
        },
      );

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const res = await fetch(
        `/api/places/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const data = (await res.json()) as {
        place?: PlaceRef;
        error?: string;
      };

      if (!res.ok || !data.place) {
        // Still usable: build a coords-only place client-side
        const place: PlaceRef = {
          id: `gps-${lat.toFixed(6)}-${lng.toFixed(6)}`,
          label: "Posizione attuale",
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          location: { lat, lng },
          source: "gps",
        };
        if (data.error) {
          // Soft warning — place is still set by caller with this fallback
          setError(null);
        }
        return place;
      }

      return { ...data.place, source: "gps" };
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        typeof (err as GeolocationPositionError).code === "number"
      ) {
        setError(geolocationErrorMessage(err as GeolocationPositionError));
      } else {
        setError("Impossibile ottenere la posizione attuale.");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { locate, loading, error, clearError: () => setError(null) };
}
