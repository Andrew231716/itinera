export type SyncState = {
  pending: number;
  running: boolean;
  error: string | null;
  lastSyncedAt: string | null;
};
let state: SyncState = {
  pending: 0,
  running: false,
  error: null,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();
export function updateSyncState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getSyncState() {
  return state;
}
