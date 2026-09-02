/**
 * Host ports — the two things the fold needs from its embedding application,
 * inverted so this package stays free of any storage or telemetry dependency.
 *
 * Armada backs the fold cache with ArmadaDB and the perf sink with its own
 * counters; Plektos can back the cache with Dexie or leave the default. The
 * defaults are a process-local Map and a no-op, so an unconfigured host is
 * correct — just colder and unmeasured.
 *
 * Call-site compatible with Armada's `@/lib/foldedCache` and `@/lib/perf`, so
 * the modules that use them are copied verbatim.
 */

export interface FoldCache {
  read<T>(key: string): Promise<T | undefined>;
  write(key: string, value: unknown): Promise<void>;
}

export interface PerfSink {
  count(label: string, ms: number, units?: number, unitName?: string): void;
}

/** Process-local default: correct, non-persistent, no cross-session warm start. */
function memoryFoldCache(): FoldCache {
  const store = new Map<string, unknown>();
  return {
    async read<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async write(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  };
}

let foldCache: FoldCache = memoryFoldCache();
let perfSink: PerfSink = { count() {} };

/** Install host-backed ports. Call once at startup, before any fold. */
export function configureConcordPorts(ports: { foldCache?: FoldCache; perfSink?: PerfSink }): void {
  if (ports.foldCache) foldCache = ports.foldCache;
  if (ports.perfSink) perfSink = ports.perfSink;
}

/** Restore the built-in defaults (tests). */
export function _resetConcordPorts(): void {
  foldCache = memoryFoldCache();
  perfSink = { count() {} };
}

export function readFolded<T>(key: string): Promise<T | undefined> {
  return foldCache.read<T>(key);
}

export function writeFolded(key: string, value: unknown): Promise<void> {
  return foldCache.write(key, value);
}

export function perfCount(label: string, ms: number, units?: number, unitName?: string): void {
  perfSink.count(label, ms, units, unitName);
}
