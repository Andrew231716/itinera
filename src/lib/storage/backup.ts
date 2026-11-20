import { z } from "zod";
import { placeSchema, preferencesSchema, tripSchema } from "./data-validation";

const stamp = z.string();
const giroStop = z.object({
  id: z.string(),
  place: placeSchema,
  arriveBy: z.string().nullable(),
  dwellMinutes: z.number().nonnegative(),
  pauseMinutes: z.number().nonnegative(),
  positionLock: z.union([
    z.literal("auto"),
    z.literal("last"),
    z.number().int().positive(),
  ]),
});
const schedule = z
  .object({
    kind: z.enum(["origin", "stop", "destination"]),
    place: placeSchema,
    arrivalAt: z.string(),
    departAt: z.string(),
    dwellMinutes: z.number(),
    pauseMinutes: z.number(),
    legFromPreviousSeconds: z.number(),
    legFromPreviousMeters: z.number(),
    cumulativeSeconds: z.number(),
  })
  .passthrough();
export const profileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  updatedAt: stamp,
  travelMode: tripSchema.shape.travelMode,
  preferences: preferencesSchema,
  exclusions: tripSchema.shape.exclusions,
  costs: tripSchema.shape.costs,
});
const archiveSchemas = {
  "itinera.trips.v1": z.array(tripSchema).max(1000),
  "itinera.savedGiri.v2": z
    .array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          createdAt: stamp,
          updatedAt: stamp,
          origin: placeSchema.nullable(),
          departureAt: z.string().nullable(),
          stops: z.array(giroStop),
          preferences: preferencesSchema,
          travelMode: tripSchema.shape.travelMode,
          schedule: z.array(schedule).nullable(),
        })
        .passthrough(),
    )
    .max(1000),
  "itinera.savedPlaces.v1": z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["favorite", "parking", "fuel", "home", "work", "other"]),
        label: z.string(),
        note: z.string().optional(),
        place: placeSchema,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    )
    .max(2000),
  "itinera.tripHistory.v1": z
    .array(
      z.object({
        id: z.string(),
        computedAt: stamp,
        fingerprint: z.string(),
        trip: tripSchema,
        routeSummary: z
          .object({
            mode: z.enum(["live", "demo"]),
            label: z.string().optional(),
            distanceMeters: z.number().optional(),
            durationSeconds: z.number().optional(),
            tollEstimate: z.number().optional(),
            tollCurrency: z.string().optional(),
          })
          .optional(),
      }),
    )
    .max(1000),
  "itinera.profiles.v1": z.array(profileSchema).max(100),
};
type ArchiveKey = keyof typeof archiveSchemas;
export const BACKUP_KEYS = Object.keys(archiveSchemas) as ArchiveKey[];

export function createBackup(): string {
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) data[key] = archiveSchemas[key].parse(JSON.parse(raw));
  }
  // Include the active unsaved itinerary as well as manually pinned trips.
  const session = localStorage.getItem("itinera.lastSession.v1");
  if (session) {
    const current = tripSchema.parse(JSON.parse(session).trip);
    const trips = (data["itinera.trips.v1"] ?? []) as z.infer<
      typeof tripSchema
    >[];
    if (!trips.some((trip) => trip.meta.id === current.meta.id))
      data["itinera.trips.v1"] = [...trips, current];
  }
  return JSON.stringify(
    {
      format: "itinera-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
}

export function restoreBackup(text: string): number {
  if (text.length > 10_000_000)
    throw new Error("Backup troppo grande (massimo 10 MB).");
  const envelope = z
    .object({
      format: z.literal("itinera-backup"),
      version: z.literal(1),
      data: z.record(z.string(), z.unknown()),
    })
    .parse(JSON.parse(text));
  const writes = new Map<string, string>();
  let count = 0;
  for (const key of Object.keys(envelope.data)) {
    if (!BACKUP_KEYS.includes(key as ArchiveKey))
      throw new Error("Il file contiene dati non riconosciuti.");
    const schema = archiveSchemas[key as ArchiveKey];
    const incoming = schema.parse(envelope.data[key]);
    const existing = schema.parse(
      JSON.parse(localStorage.getItem(key) ?? "[]"),
    );
    const recordId = (item: unknown): string => {
      const record = item as { id?: string; meta?: { id: string } };
      return record.meta?.id ?? record.id!;
    };
    const merged = new Map(existing.map((item) => [recordId(item), item]));
    for (const item of incoming) {
      const previous = merged.get(recordId(item));
      // Compare the appropriate timestamp for each supported record type.
      const when = (value: unknown) => {
        const record = value as {
          meta?: { updatedAt?: string };
          updatedAt?: string;
          computedAt?: string;
        };
        return (
          record.meta?.updatedAt ?? record.updatedAt ?? record.computedAt ?? ""
        );
      };
      if (!previous || when(item) >= when(previous))
        merged.set(recordId(item), item);
    }
    writes.set(key, JSON.stringify([...merged.values()]));
    count += incoming.length;
  }
  const originals = new Map(
    [...writes.keys()].map((key) => [key, localStorage.getItem(key)]),
  );
  try {
    for (const [key, value] of writes) localStorage.setItem(key, value);
  } catch (error) {
    for (const [key, value] of originals) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  }
  return count;
}
