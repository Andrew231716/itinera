import type { PlaceRef } from "@/lib/types/trip";
import type { FuelStation } from "@/lib/fuel/types";

export function fuelStationToPlaceRef(station: FuelStation): PlaceRef {
  return {
    id: station.id,
    label: station.name,
    address: station.address,
    placeId: station.id.startsWith("ggl-fuel-")
      ? station.id.replace(/^ggl-fuel-/, "")
      : undefined,
    location: { ...station.location },
    source: "manual",
  };
}
