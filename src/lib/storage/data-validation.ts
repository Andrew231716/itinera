import { z } from "zod";

const iso = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "Data non valida");
const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const placeSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string().optional(),
  placeId: z.string().optional(),
  location: point,
  source: z.enum(["places", "map_click", "manual", "demo", "assistant", "gps"]),
});
export const preferencesSchema = z.object({
  avoidTolls: z.boolean(),
  avoidHighways: z.boolean(),
  avoidFerries: z.boolean(),
  avoidTunnels: z.boolean(),
  preferFastest: z.boolean(),
  preferShortest: z.boolean(),
  preferScenic: z.boolean(),
  maxExtraMinutes: z.number().nonnegative().nullable(),
});
const exclusionBase = z.object({
  id: z.string(),
  label: z.string(),
  strength: z.enum(["hard", "soft"]),
  notes: z.string().optional(),
  createdAt: iso,
});
const exclusion = z.discriminatedUnion("kind", [
  exclusionBase.extend({
    kind: z.enum(["city", "address", "road"]),
    place: placeSchema.optional(),
    radiusMeters: z.number().nonnegative(),
  }),
  exclusionBase.extend({
    kind: z.literal("geo_zone"),
    polygon: z.array(point).min(3),
  }),
  exclusionBase.extend({
    kind: z.literal("road_segment"),
    path: z.array(point).min(2),
    bufferMeters: z.number().nonnegative(),
  }),
]);
export const tripSchema = z.object({
  meta: z.object({
    id: z.string(),
    title: z.string(),
    createdAt: iso,
    updatedAt: iso,
  }),
  origin: placeSchema.nullable(),
  destination: placeSchema.nullable(),
  stops: z.array(
    z.object({
      id: z.string(),
      place: placeSchema,
      dwellMinutes: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }),
  ),
  departureAt: iso.nullable(),
  arrivalBy: iso.nullable().optional(),
  costs: z
    .object({
      consumptionLitersPer100Km: z.number().min(0).max(100),
      fuelPricePerLiter: z.number().min(0).max(20),
    })
    .optional(),
  travelMode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"]),
  preferences: preferencesSchema,
  exclusions: z.array(exclusion),
  optimizeStopOrder: z.boolean(),
  selectedRouteId: z.string().nullable(),
});
