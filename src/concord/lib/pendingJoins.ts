/**
 * Optimistic pending joins — UI-only membership entries for communities whose
 * durable join chain (fresh bundle resolve → ban check → vault write) is still
 * running in the background after the user clicked Join.
 *
 * The Community List is the vault and the only durable record of membership;
 * nothing here is persisted or published. A pending entry merely lets
 * `useCommunity`/`useLiveCommunities` resolve the community immediately so the
 * page can open and start syncing while the list write is in flight. On
 * success the real list entry replaces it; on failure it is removed and the
 * community page falls through to its ordinary no-access handling.
 */
import type { CommunityListEntry } from "./communityList";

const entries = new Map<string, CommunityListEntry>();
const listeners = new Set<() => void>();
/** Stable snapshot for useSyncExternalStore; rebuilt only on change. */
let snapshot: CommunityListEntry[] = [];

function notify(): void {
  snapshot = [...entries.values()];
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener must never break the store for the others.
    }
  }
}

/** Register an optimistic entry (keyed by community id; newest wins). */
export function addPendingJoin(entry: CommunityListEntry): void {
  entries.set(entry.community_id, entry);
  notify();
}

/** Drop an optimistic entry — the durable join landed, or it failed. */
export function removePendingJoin(communityId: string): void {
  if (entries.delete(communityId)) notify();
}

/** The current optimistic entries (stable identity between changes). */
export function pendingJoinEntries(): CommunityListEntry[] {
  return snapshot;
}

/** Subscribe to changes. Returns an unsubscribe. */
export function subscribePendingJoins(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: drop all entries and listeners. */
export function _resetPendingJoinsForTests(): void {
  entries.clear();
  snapshot = [];
  listeners.clear();
}
