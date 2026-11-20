"use client";
import { useRef, useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { createBackup, restoreBackup } from "@/lib/storage/backup";
import {
  getTripRepository,
  syncPendingTrips,
  preserveSyncConflicts,
} from "@/lib/storage/trip-repository";
import { useSyncState } from "@/hooks/useSyncState";
import { useTripStore } from "@/lib/store/trip-store";
import { Button } from "@/components/ui/primitives";

export function WorkspaceTools() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = useSyncState();
  async function restore(file: File) {
    setBusy(true);
    try {
      if (file.size > 10_000_000)
        throw new Error("Backup troppo grande (massimo 10 MB).");
      const count = restoreBackup(await file.text());
      // Import is local first and every imported trip is then queued for cloud sync.
      const repo = getTripRepository();
      for (const trip of await repo.list()) await repo.save(trip);
      await useTripStore.getState().refreshSavedTrips();
      useTripStore.getState().refreshTripHistory();
      window.dispatchEvent(new Event("itinera-library-changed"));
      setMessage(
        `${count} elementi importati. Viaggi, giri e preferiti aggiornati.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ripristino non riuscito.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section
      className="workspace-card space-y-3"
      aria-label="Backup e sincronizzazione"
    >
      <h3 className="font-semibold">Backup e sincronizzazione</h3>
      <p className="text-sm text-[var(--ink-muted)]">
        Conserva viaggi, giri, cronologia, preferiti e profili in un file
        personale. Sul nuovo dispositivo puoi scaricare di nuovo le indicazioni
        offline.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            try {
              const url = URL.createObjectURL(
                new Blob([createBackup()], { type: "application/json" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `itinera-backup-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setMessage("Backup esportato. Conservalo in un luogo personale.");
            } catch {
              setMessage(
                "Esportazione non riuscita. Controlla lo spazio disponibile.",
              );
            }
          }}
        >
          <Download size={16} />
          Esporta backup
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {busy ? "Importazione…" : "Importa backup"}
        </Button>
        <Button
          variant="ghost"
          disabled={sync.running}
          onClick={() => void syncPendingTrips()}
        >
          <RefreshCw size={16} />
          Riprova cloud
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void restore(file);
        }}
      />
      <p className="text-sm text-[var(--ink-muted)]">
        {sync.running
          ? "Sincronizzazione in corso…"
          : sync.pending
            ? `${sync.pending} modifiche salvate qui, in attesa del cloud.`
            : sync.error
              ? "Cloud da verificare. I dati locali sono disponibili."
              : sync.lastSyncedAt
                ? "Cloud aggiornato."
                : "I dati vengono conservati prima sul dispositivo."}
      </p>
      {sync.error?.startsWith("Conflitto:") && (
        <Button
          variant="outline"
          disabled={sync.running}
          onClick={() => {
            setBusy(true);
            void preserveSyncConflicts()
              .then(async (copies) => {
                const store = useTripStore.getState();
                const copy = copies.get(store.trip.meta.id);
                if (copy) store.loadTrip(copy);
                await store.refreshSavedTrips();
                setMessage(
                  "Versione cloud e copia locale conservate in Salvati.",
                );
              })
              .catch((error) => setMessage(error.message))
              .finally(() => setBusy(false));
          }}
        >
          Conserva entrambe
        </Button>
      )}
      {sync.error && (
        <p className="text-sm text-[var(--ink-muted)]">{sync.error}</p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
