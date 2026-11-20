"use client";
import { useSyncExternalStore } from "react";
import { getSyncState, subscribeSync } from "@/lib/storage/sync-state";
const serverState = {
  pending: 0,
  running: false,
  error: null,
  lastSyncedAt: null,
};
export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState, () => serverState);
}
