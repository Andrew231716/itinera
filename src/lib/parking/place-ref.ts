import type { PlaceRef } from "@/lib/types/trip";
import type { ParkingSpot } from "@/lib/parking/types";

/** Convert a parking spot into a PlaceRef usable as destination / stop. */
export function parkingSpotToPlaceRef(spot: ParkingSpot): PlaceRef {
  return {
    id: spot.id,
    label: spot.name,
    address: spot.address,
    placeId: spot.id.startsWith("ggl-")
      ? spot.id.replace(/^ggl-/, "")
      : undefined,
    location: { ...spot.location },
    source: "manual",
  };
}
