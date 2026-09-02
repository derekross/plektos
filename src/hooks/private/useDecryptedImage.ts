/**
 * Turn an encrypted cover pointer into something an <img> can render.
 *
 * Decrypt-once per pointer, cached for the session: the party page re-renders
 * often and a cover is a few megabytes of AES. Object URLs are deliberately NOT
 * revoked on unmount — a revoked URL renders as a broken image if the same
 * pointer mounts again, and the cache is bounded by the handful of parties a
 * user can actually open.
 */
import { useEffect, useState } from "react";

import { decryptImagePointer } from "@/concord/lib/image";
import type { ImagePointer } from "@/concord/lib/types";

const cache = new Map<string, Promise<string>>();

const keyOf = (p: ImagePointer) => `${p.url}\n${p.key}\n${p.nonce}`;

export function useDecryptedImage(pointer: ImagePointer | undefined) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pointer) {
      setUrl(undefined);
      return;
    }
    const k = keyOf(pointer);

    // Synchronous re-seed on remount when it is already resolved, so a
    // revisited party does not flash an empty hero.
    let live = true;
    let promise = cache.get(k);
    if (!promise) {
      promise = decryptImagePointer(pointer);
      cache.set(k, promise);
      // A failed decrypt must not be memoized forever — a transient relay or
      // Blossom outage would otherwise blank the cover for the whole session.
      promise.catch(() => cache.delete(k));
    }

    promise.then(
      (objectUrl) => {
        if (live) {
          setUrl(objectUrl);
          setFailed(false);
        }
      },
      () => {
        if (live) setFailed(true);
      },
    );

    return () => {
      live = false;
    };
  }, [pointer]);

  return { url, failed };
}
