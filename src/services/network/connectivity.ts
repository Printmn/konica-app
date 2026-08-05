import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Connectivity source of truth.
 *
 * A single NetInfo subscription is shared by every consumer; the last known
 * state is cached so callers can ask synchronously before the first event.
 */

export type ConnectivityListener = (isOnline: boolean) => void;

let lastKnownOnline = true;
const listeners = new Set<ConnectivityListener>();

const resolveOnline = (state: NetInfoState): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false;

NetInfo.addEventListener((state) => {
  const next = resolveOnline(state);
  if (next === lastKnownOnline) return;
  lastKnownOnline = next;
  listeners.forEach((listener) => listener(next));
});

export const isOnline = (): boolean => lastKnownOnline;

export async function refreshConnectivity(): Promise<boolean> {
  const state = await NetInfo.fetch();
  lastKnownOnline = resolveOnline(state);
  return lastKnownOnline;
}

export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
