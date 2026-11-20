"use client";
import { useEffect, useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import { tripSchema } from "@/lib/storage/data-validation";
import { syncPendingTrips } from "@/lib/storage/trip-repository";
import type { OfflineTripPack } from "@/lib/storage/offline-trips";

const SESSION_KEY = "itinera.lastSession.v1";
export function useTravelWorkspace() {
  const [resume, setResume] = useState<OfflineTripPack | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (
        saved &&
        tripSchema.safeParse(saved.trip).success &&
        Array.isArray(saved.routes)
      )
        setResume(saved);
    } catch {
      setStorageError("Impossibile recuperare la sessione precedente.");
    }
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      const state = useTripStore.getState();
      try {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            id: state.trip.meta.id,
            title: state.trip.meta.title,
            savedAt: new Date().toISOString(),
            trip: state.trip,
            routes: state.routes,
            selectedRouteId: state.trip.selectedRouteId,
            sizeBytes: 0,
          }),
        );
        setStorageError(null);
      } catch {
        setStorageError(
          "Memoria piena: esporta un backup per conservare le modifiche.",
        );
      }
    };
    const unsubscribe = useTripStore.subscribe((state, previous) => {
      if (state.trip === previous.trip && state.routes === previous.routes)
        return;
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    });
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void syncPendingTrips();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer);
        save();
      } else online();
    };
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", visibility);
    const retry = setInterval(() => {
      if (navigator.onLine) void syncPendingTrips();
    }, 60_000);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setStorageError(
            "Installazione offline non riuscita. Riprova alla prossima apertura.",
          ),
        );
    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearInterval(retry);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return {
    resume,
    storageError,
    offline,
    dismissResume: () => setResume(null),
  };
}
